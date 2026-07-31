/* ============================================================
   app.js
   アプリケーションのエントリーポイント
   --------------------------------------------------------
   含まれるクラス：
     - TechnologyManager … 技術データの読み込み・保持・検索補助
     - UIManager         … 画面描画（カード / チップ / 件数 など）
     - App               … 各マネージャーを統括するアプリ本体
   --------------------------------------------------------
   ※ FilterManager / SearchManager / ModalManager は
      それぞれ filter.js / search.js / modal.js に定義
   ============================================================ */

"use strict";

/* ============================================================
   TechnologyManager
   技術データ（JSON）の読み込みと保持・参照を担当
   ============================================================ */
class TechnologyManager {
  constructor(dataUrl) {
    this.dataUrl = dataUrl;

    /** @type {Array} 全技術データ */
    this.technologies = [];

    /** @type {Array<string>} カテゴリ一覧 */
    this.categories = [];

    /** @type {Array<Object>} ゾーン定義（風景マップのエリア） */
    this.zones = [];

    /** @type {Object} メタ情報（会社名・タイトル等） */
    this.meta = {};

    /** ID→技術オブジェクトの高速参照マップ */
    this._byId = new Map();
  }

  /**
   * JSONを読み込み、内部状態を初期化する
   * @returns {Promise<void>}
   */
  async load() {
    const res = await fetch(this.dataUrl);
    if (!res.ok) {
      throw new Error(`データ取得に失敗しました (HTTP ${res.status})`);
    }
    const data = await res.json();

    this.technologies = Array.isArray(data.technologies)
      ? data.technologies
      : [];
    this.meta = data.meta || {};

    // カテゴリはJSON指定を優先。無ければデータから自動収集
    this.categories =
      Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories
        : this._collectCategories();

    // ゾーン定義
    this.zones = Array.isArray(data.zones) ? data.zones : [];

    // ID参照マップを構築
    this._byId = new Map(this.technologies.map((t) => [t.id, t]));
  }

  /** ゾーン定義を返す */
  getZones() {
    return this.zones;
  }

  /**
   * ゾーン別の技術件数を集計する
   * @returns {Map<string, number>}
   */
  getZoneCounts() {
    const counts = new Map();
    this.zones.forEach((z) => counts.set(z.key, 0));
    this.technologies.forEach((tech) => {
      if (tech.zone) counts.set(tech.zone, (counts.get(tech.zone) || 0) + 1);
    });
    return counts;
  }

  /** 全技術データを返す */
  getAll() {
    return this.technologies;
  }

  /** IDから技術を取得 */
  getById(id) {
    return this._byId.get(Number(id));
  }

  /**
   * 各カテゴリに属する技術件数を集計する
   * @returns {Map<string, number>}
   */
  getCategoryCounts() {
    const counts = new Map();
    this.categories.forEach((c) => counts.set(c, 0));

    this.technologies.forEach((tech) => {
      this._asArray(tech.category).forEach((cat) => {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      });
    });
    return counts;
  }

  /** データから重複なくカテゴリを収集（フォールバック用） */
  _collectCategories() {
    const set = new Set();
    this.technologies.forEach((tech) => {
      this._asArray(tech.category).forEach((c) => set.add(c));
    });
    return [...set];
  }

  _asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }
}

/* ============================================================
   UIManager
   DOM描画を一手に引き受ける（ロジックは持たない）
   ============================================================ */
class UIManager {
  constructor() {
    // 主要なDOM要素をキャッシュ
    this.el = {
      cardGrid: document.getElementById("list-view"),
      categoryList: document.getElementById("category-list"),
      resultCount: document.getElementById("result-count"),
      breadcrumb: document.getElementById("breadcrumb"),
      loading: document.getElementById("loading"),
      noData: document.getElementById("no-data"),
      searchClear: document.getElementById("search-clear"),
      footerYear: document.getElementById("footer-year"),
    };
  }

  /* --------------------------------------------------
     ローディング表示の切り替え
  -------------------------------------------------- */
  showLoading(show) {
    this.el.loading.hidden = !show;
  }

  /* --------------------------------------------------
     カテゴリチップの描画
  -------------------------------------------------- */

  /**
   * カテゴリチップを生成する
   * @param {Array<string>} categories
   * @param {Map<string,number>} counts カテゴリ別件数
   * @param {(category:string)=>void} onToggle クリック時コールバック
   */
  renderCategories(categories, counts, onToggle) {
    const frag = document.createDocumentFragment();

    categories.forEach((category) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "category-chip";
      chip.setAttribute("aria-pressed", "false");
      chip.dataset.category = category;

      const count = counts.get(category) || 0;
      chip.innerHTML =
        `${this._esc(category)}` +
        `<span class="category-chip__count">${count}</span>`;

      chip.addEventListener("click", () => onToggle(category));
      frag.appendChild(chip);
    });

    this.el.categoryList.innerHTML = "";
    this.el.categoryList.appendChild(frag);
  }

  /**
   * カテゴリチップの選択状態（見た目）を更新
   * @param {Set<string>} selected
   */
  updateCategoryStates(selected) {
    this.el.categoryList
      .querySelectorAll(".category-chip")
      .forEach((chip) => {
        const isOn = selected.has(chip.dataset.category);
        chip.setAttribute("aria-pressed", isOn ? "true" : "false");
      });
  }

  /* --------------------------------------------------
     カード一覧の描画
  -------------------------------------------------- */

  /**
   * 技術カードを描画する
   * @param {Array} technologies 表示対象（絞り込み・ソート済み）
   * @param {Object} handlers
   * @param {(id:number)=>void} handlers.onCardClick
   * @param {(keyword:string)=>void} handlers.onTagClick
   */
  renderCards(technologies, { onCardClick, onTagClick }) {
    // No Data 判定
    if (technologies.length === 0) {
      this.el.cardGrid.innerHTML = "";
      this.el.noData.hidden = false;
      return;
    }
    this.el.noData.hidden = true;

    const frag = document.createDocumentFragment();

    technologies.forEach((tech) => {
      frag.appendChild(this._buildCard(tech, onCardClick, onTagClick));
    });

    this.el.cardGrid.innerHTML = "";
    this.el.cardGrid.appendChild(frag);
  }

  /**
   * 1枚分のカード要素を生成
   * アクセシビリティ：詳細を開く操作は実ボタン（.card__open）に持たせ、
   * その擬似要素でカード全面をクリック可能にする（stretched link パターン）。
   * タグは別のタブ停止点となり、ボタンの入れ子を避ける。
   */
  _buildCard(tech, onCardClick, onTagClick) {
    const card = document.createElement("article");
    card.className = "card";

    // カテゴリバッジ
    const categories = this._asArray(tech.category)
      .map((c) => `<span class="badge">${this._esc(c)}</span>`)
      .join("");

    // キーワードタグ（先頭4件まで表示）
    const keywords = this._asArray(tech.keywords).slice(0, 4);
    const tags = keywords
      .map(
        (kw) =>
          `<button type="button" class="tag" data-keyword="${this._esc(
            kw
          )}">${this._esc(kw)}</button>`
      )
      .join("");

    card.innerHTML = `
      <div class="card__categories">${categories}</div>
      <h2 class="card__name">
        <button type="button" class="card__open"
          aria-label="${this._esc(tech.name)} の詳細を表示">${this._esc(
      tech.name
    )}</button>
      </h2>
      <p class="card__summary">${this._esc(tech.summary)}</p>
      <div class="card__tags">${tags}</div>
    `;

    // 詳細を開くボタン（Enter・Spaceはボタン標準動作で対応）
    card
      .querySelector(".card__open")
      .addEventListener("click", () => onCardClick(tech.id));

    // タグクリック → タグ検索
    card.querySelectorAll(".tag").forEach((tagBtn) => {
      tagBtn.addEventListener("click", () =>
        onTagClick(tagBtn.dataset.keyword)
      );
    });

    return card;
  }

  /* --------------------------------------------------
     件数・パンくず・検索クリアボタン
  -------------------------------------------------- */

  /**
   * 検索結果件数を表示
   * @param {number} shown 表示件数
   * @param {number} total 全件数
   */
  updateResultCount(shown, total) {
    this.el.resultCount.innerHTML =
      `<strong>${shown}</strong> 件の技術を表示中` +
      `<span class="result-count__total">（全 ${total} 件）</span>`;
  }

  /**
   * パンくず（現在の検索条件）を表示
   * @param {Object} state
   * @param {string} state.query 検索語
   * @param {Array<string>} state.zones 選択ゾーンのラベル
   * @param {Array<string>} state.categories 選択カテゴリ
   */
  updateBreadcrumb({ query, zones, categories }) {
    const items = ["<li>技術マップ</li>"];

    if (zones.length > 0) {
      const tags = zones
        .map((z) => `<span class="breadcrumb__tag">${this._esc(z)}</span>`)
        .join(" ");
      items.push(`<li>ゾーン：${tags}</li>`);
    }
    if (categories.length > 0) {
      const tags = categories
        .map((c) => `<span class="breadcrumb__tag">${this._esc(c)}</span>`)
        .join(" ");
      items.push(`<li>カテゴリ：${tags}</li>`);
    }
    if (query) {
      items.push(`<li>検索：「${this._esc(query)}」</li>`);
    }
    if (zones.length === 0 && categories.length === 0 && !query) {
      items.push("<li>すべての技術</li>");
    }

    this.el.breadcrumb.innerHTML = items.join("");
  }

  /** 検索クリアボタンの表示切り替え */
  toggleSearchClear(show) {
    this.el.searchClear.hidden = !show;
  }

  /** フッターの年号を設定 */
  setFooterYear() {
    this.el.footerYear.textContent = new Date().getFullYear();
  }

  /* --------------------------------------------------
     内部ヘルパー
  -------------------------------------------------- */
  _asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

/* ============================================================
   App
   アプリケーション本体（各マネージャーを統括）
   ============================================================ */
class App {
  constructor() {
    this.tech = new TechnologyManager("data/technology.json");
    this.filter = new FilterManager();
    this.search = new SearchManager();
    this.ui = new UIManager();

    // モーダルには「ID解決」と各種クリック時の挙動を注入
    this.modal = new ModalManager({
      resolveById: (id) => this.tech.getById(id),
      onRelatedClick: (id) => this._goToRelated(id),
      onKeywordClick: (kw) => this._searchByKeyword(kw),
    });

    // 風景マップ：ピンクリックで詳細、ゾーンチップで絞り込み
    this.map = new MapManager({
      onPinClick: (id) => this.modal.open(this.tech.getById(id)),
      onZoneToggle: (zoneKey) => this._onZoneToggle(zoneKey),
    });

    // 現在の表示モード（'map' | 'list'）。初期はビジュアルなマップ表示
    this.view = "map";

    // 入力要素の参照
    this.searchInput = document.getElementById("search-input");
    this.sortSelect = document.getElementById("sort-select");
    this.mapView = document.getElementById("map-view");
    this.listView = document.getElementById("list-view");
    this.sortWrap = document.getElementById("sort-wrap");
    this.viewMapBtn = document.getElementById("view-map");
    this.viewListBtn = document.getElementById("view-list");
  }

  /* --------------------------------------------------
     初期化
  -------------------------------------------------- */
  async init() {
    this.ui.setFooterYear();
    this.ui.showLoading(true);

    try {
      await this.tech.load();
    } catch (err) {
      this._showLoadError(err);
      return;
    }

    this.ui.showLoading(false);

    // カテゴリチップを生成
    this.ui.renderCategories(
      this.tech.categories,
      this.tech.getCategoryCounts(),
      (category) => this._onCategoryToggle(category)
    );

    // 風景マップ（ゾーンラベル＋ピン）を生成
    this.map.render(
      this.tech.getAll(),
      this.tech.getZones(),
      this.tech.getZoneCounts()
    );

    this._bindEvents();
    this._applyView(); // 初期ビューを反映
    this.render(); // 初回描画
  }

  /* --------------------------------------------------
     イベント登録
  -------------------------------------------------- */
  _bindEvents() {
    // 検索入力（リアルタイム／デバウンス）
    this.searchInput.addEventListener("input", () => {
      const value = this.searchInput.value;
      this.ui.toggleSearchClear(value.length > 0);
      this.search.debounce(() => {
        this.search.setQuery(value);
        this.render();
      });
    });

    // 検索クリアボタン
    this.ui.el.searchClear.addEventListener("click", () => {
      this._clearSearch();
    });

    // ソート変更
    this.sortSelect.addEventListener("change", () => {
      this.filter.setSort(this.sortSelect.value);
      this.render();
    });

    // 表示切替（マップ / 一覧）
    this.viewMapBtn.addEventListener("click", () => this._setView("map"));
    this.viewListBtn.addEventListener("click", () => this._setView("list"));

    // フィルタ全体リセット
    document
      .getElementById("filter-reset")
      .addEventListener("click", () => this._resetAll());

    // No Data 内のリセットボタン
    document
      .getElementById("no-data-reset")
      .addEventListener("click", () => this._resetAll());
  }

  /* --------------------------------------------------
     描画パイプライン
     全データ → 検索 → カテゴリ絞り込み → ゾーン絞り込み → 描画
  -------------------------------------------------- */
  render() {
    const all = this.tech.getAll();

    // 検索 → カテゴリ → ゾーン の順に絞り込む
    const searched = this.search.apply(all);
    const byCategory = this.filter.applyCategoryFilter(searched);
    const filtered = this.filter.applyZoneFilter(byCategory);

    // --- マップ表示：該当ピンを強調（非該当は減光） ---
    const visibleIds = new Set(filtered.map((t) => t.id));
    this.map.update(visibleIds);
    this.map.updateZoneStates(this.filter.selectedZones);

    // --- 一覧表示：ソートしてカード描画 ---
    if (this.view === "list") {
      const sorted = this.filter.applySort(filtered);
      this.ui.renderCards(sorted, {
        onCardClick: (id) => this.modal.open(this.tech.getById(id)),
        onTagClick: (kw) => this._searchByKeyword(kw),
      });
    } else {
      // マップ表示中は一覧用のNo Dataパネルは隠す
      this.ui.el.noData.hidden = true;
    }

    // 件数・パンくず・チップ状態を更新
    this.ui.updateResultCount(filtered.length, all.length);
    this.ui.updateBreadcrumb({
      query: this.search.query,
      zones: this._selectedZoneLabels(),
      categories: this.filter.getSelectedCategories(),
    });
    this.ui.updateCategoryStates(this.filter.selectedCategories);
  }

  /** 選択中ゾーンのラベル配列を返す（パンくず表示用） */
  _selectedZoneLabels() {
    const keys = this.filter.selectedZones;
    return this.tech
      .getZones()
      .filter((z) => keys.has(z.key))
      .map((z) => z.label);
  }

  /* --------------------------------------------------
     表示モードの切り替え
  -------------------------------------------------- */

  /** 表示モードを設定して反映 */
  _setView(view) {
    if (this.view === view) return;
    this.view = view;
    this._applyView();
    this.render();
  }

  /** 現在の表示モードをDOMへ反映 */
  _applyView() {
    const isMap = this.view === "map";

    this.mapView.hidden = !isMap;
    this.listView.hidden = isMap;
    // ソートは一覧表示のみ意味を持つため、マップ表示では隠す
    this.sortWrap.hidden = isMap;

    // トグルボタンの状態
    this.viewMapBtn.classList.toggle("is-active", isMap);
    this.viewListBtn.classList.toggle("is-active", !isMap);
    this.viewMapBtn.setAttribute("aria-selected", isMap ? "true" : "false");
    this.viewListBtn.setAttribute("aria-selected", isMap ? "false" : "true");
  }

  /* --------------------------------------------------
     各種操作ハンドラ
  -------------------------------------------------- */

  /** カテゴリチップのトグル */
  _onCategoryToggle(category) {
    this.filter.toggleCategory(category);
    this.render();
  }

  /** ゾーンチップ（風景マップ）のトグル */
  _onZoneToggle(zoneKey) {
    this.filter.toggleZone(zoneKey);
    this.render();
  }

  /** キーワード（タグ）による検索 */
  _searchByKeyword(keyword) {
    this.searchInput.value = keyword;
    this.ui.toggleSearchClear(true);
    this.search.setQuery(keyword);
    this.render();
    // 一覧先頭へスクロールして結果を見せる
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** 関連技術へ移動（モーダルを開き直す） */
  _goToRelated(id) {
    const target = this.tech.getById(id);
    if (target) {
      this.modal.open(target);
      this.modal.body.scrollTop = 0;
    }
  }

  /** 検索のみクリア */
  _clearSearch() {
    this.searchInput.value = "";
    this.ui.toggleSearchClear(false);
    this.search.clear();
    this.render();
    this.searchInput.focus();
  }

  /** 検索・カテゴリ・ゾーン・ソートをすべて初期化 */
  _resetAll() {
    this.searchInput.value = "";
    this.ui.toggleSearchClear(false);
    this.search.clear();
    this.filter.clearCategories();
    this.filter.clearZones();
    this.filter.setSort("name");
    this.sortSelect.value = "name";
    this.render();
  }

  /* --------------------------------------------------
     読み込みエラー表示
  -------------------------------------------------- */
  _showLoadError(err) {
    this.ui.showLoading(false);
    this.ui.el.noData.hidden = false;
    this.ui.el.noData.innerHTML = `
      <p class="no-data__icon" aria-hidden="true">⚠️</p>
      <p class="no-data__title">データの読み込みに失敗しました</p>
      <p class="no-data__hint">
        ローカルで開いている場合、ブラウザのセキュリティ制限により
        JSONを読み込めないことがあります。<br>
        簡易サーバー経由でアクセスしてください（READMEを参照）。
      </p>`;
    // 開発者向けにコンソールへ詳細を出力
    console.error("技術データの読み込みエラー:", err);
  }
}

/* ============================================================
   起動
   DOM構築後にアプリを初期化する
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
