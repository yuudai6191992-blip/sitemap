/* ============================================================
   modal.js
   ModalManager クラス
   --------------------------------------------------------
   責務：
     - 技術詳細モーダルの開閉
     - 詳細内容（HTML）の組み立て
     - アクセシビリティ対応
        （ESCで閉じる / フォーカストラップ / フォーカス復帰）
   ============================================================ */

class ModalManager {
  /**
   * @param {Object} options
   * @param {(id:number)=>Object|undefined} options.resolveById
   *        関連技術IDから技術オブジェクトを取得する関数
   * @param {(id:number)=>void} options.onRelatedClick
   *        関連技術リンククリック時のコールバック
   * @param {(keyword:string)=>void} options.onKeywordClick
   *        キーワード（タグ）クリック時のコールバック
   */
  constructor({ resolveById, onRelatedClick, onKeywordClick }) {
    this.resolveById = resolveById;
    this.onRelatedClick = onRelatedClick;
    this.onKeywordClick = onKeywordClick;

    // DOM参照
    this.modal = document.getElementById("modal");
    this.body = document.getElementById("modal-body");

    /** モーダルを開く前にフォーカスしていた要素（閉じたら戻す） */
    this._lastFocused = null;

    this._bindEvents();
  }

  /* --------------------------------------------------
     イベント登録
  -------------------------------------------------- */
  _bindEvents() {
    // オーバーレイ・閉じるボタン（data-modal-close属性）で閉じる
    this.modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-modal-close]")) {
        this.close();
      }
    });

    // キーボード操作：ESCで閉じる / Tabでフォーカストラップ
    this.modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.close();
      } else if (e.key === "Tab") {
        this._trapFocus(e);
      }
    });
  }

  /* --------------------------------------------------
     開く / 閉じる
  -------------------------------------------------- */

  /**
   * 技術データを受け取り詳細を表示する
   * @param {Object} tech
   */
  open(tech) {
    if (!tech) return;

    this._lastFocused = document.activeElement;
    this.body.innerHTML = this._buildDetailHTML(tech);
    this._bindDetailActions();

    this.modal.hidden = false;
    document.body.style.overflow = "hidden"; // 背面スクロール抑止

    // ダイアログ内へフォーカス移動（アクセシビリティ）
    const closeBtn = this.modal.querySelector(".modal__close");
    if (closeBtn) closeBtn.focus();
  }

  /** モーダルを閉じ、元の要素へフォーカスを戻す */
  close() {
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    document.body.style.overflow = "";
    this.body.innerHTML = "";

    if (this._lastFocused && typeof this._lastFocused.focus === "function") {
      this._lastFocused.focus();
    }
  }

  /* --------------------------------------------------
     詳細HTMLの組み立て
  -------------------------------------------------- */

  /**
   * 技術データから詳細表示用のHTML文字列を生成
   * @param {Object} tech
   * @returns {string}
   */
  _buildDetailHTML(tech) {
    const categories = this._asArray(tech.category)
      .map((c) => `<span class="badge">${this._esc(c)}</span>`)
      .join("");

    // 成熟度バッジ（任意項目）
    const maturity = tech.maturity
      ? `<span class="maturity">成熟度：${this._esc(tech.maturity)}</span>`
      : "";

    return `
      <div class="detail__categories">${categories}${maturity}</div>
      <h2 class="detail__title" id="modal-title">${this._esc(tech.name)}</h2>
      <p class="detail__summary">${this._esc(tech.summary)}</p>

      ${this._section("概要", `<p class="detail__text">${this._esc(tech.description)}</p>`)}
      ${this._listSection("特徴", tech.features)}
      ${this._listSection("適用事例", tech.cases)}
      ${this._strengthSection(tech.strength)}
      ${this._relatedSection(tech.related)}
      ${this._keywordSection(tech.keywords)}
      ${this._metaSection(tech)}
    `;
  }

  /** 汎用セクション（内容が空なら描画しない） */
  _section(title, innerHTML) {
    if (!innerHTML) return "";
    return `
      <section class="detail__section">
        <h3 class="detail__section-title">${title}</h3>
        ${innerHTML}
      </section>`;
  }

  /** 箇条書きセクション（features / cases） */
  _listSection(title, items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    const lis = items
      .map((item) => `<li>${this._esc(item)}</li>`)
      .join("");
    return this._section(title, `<ul class="detail__list">${lis}</ul>`);
  }

  /** 強みセクション */
  _strengthSection(strength) {
    if (!strength) return "";
    return this._section(
      "強み",
      `<p class="detail__text">${this._esc(strength)}</p>`
    );
  }

  /** 関連技術セクション（リンクボタン） */
  _relatedSection(related) {
    if (!Array.isArray(related) || related.length === 0) return "";

    const links = related
      .map((id) => {
        const rel = this.resolveById(id);
        if (!rel) return ""; // 存在しないIDは無視
        return `<button type="button" class="related-link" data-related-id="${rel.id}">${this._esc(
          rel.name
        )}</button>`;
      })
      .filter(Boolean)
      .join("");

    if (!links) return "";
    return this._section(
      "関連技術",
      `<div class="detail__related">${links}</div>`
    );
  }

  /** キーワード（タグ）セクション：クリックで検索 */
  _keywordSection(keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) return "";
    const tags = keywords
      .map(
        (kw) =>
          `<button type="button" class="tag" data-keyword="${this._esc(
            kw
          )}">${this._esc(kw)}</button>`
      )
      .join("");
    return this._section("キーワード", `<div class="detail__tags">${tags}</div>`);
  }

  /** 保有部署・担当者・URLなどのメタ情報 */
  _metaSection(tech) {
    const rows = [];
    if (tech.department) rows.push(["保有部署", this._esc(tech.department)]);
    if (tech.owner) rows.push(["担当者", this._esc(tech.owner)]);
    if (tech.registered) rows.push(["登録日", this._esc(tech.registered)]);
    if (tech.url) {
      rows.push([
        "関連URL",
        `<a href="${this._esc(tech.url)}" target="_blank" rel="noopener noreferrer">
           ${this._esc(tech.url)}</a>`,
      ]);
    }
    if (rows.length === 0) return "";

    const dl = rows
      .map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`)
      .join("");
    return this._section("担当情報", `<dl class="detail__meta">${dl}</dl>`);
  }

  /* --------------------------------------------------
     詳細内の操作（関連技術・キーワード）にイベント付与
  -------------------------------------------------- */
  _bindDetailActions() {
    // 関連技術リンク → 対象技術へ移動
    this.body.querySelectorAll("[data-related-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.relatedId);
        this.onRelatedClick(id);
      });
    });

    // キーワードタグ → タグ検索
    this.body.querySelectorAll("[data-keyword]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.close();
        this.onKeywordClick(btn.dataset.keyword);
      });
    });
  }

  /* --------------------------------------------------
     アクセシビリティ：フォーカストラップ
  -------------------------------------------------- */
  _trapFocus(e) {
    const focusable = this.modal.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* --------------------------------------------------
     内部ヘルパー
  -------------------------------------------------- */

  /** 値を配列に正規化 */
  _asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  /** HTMLエスケープ（XSS対策・データ由来文字列は必ず通す） */
  _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
