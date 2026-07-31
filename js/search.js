/* ============================================================
   search.js
   SearchManager クラス
   --------------------------------------------------------
   責務：
     - 全文検索（技術名・概要・説明・キーワード・カテゴリを対象）
     - リアルタイム検索のための入力デバウンス
   ============================================================ */

class SearchManager {
  constructor() {
    /** @type {string} 現在の検索キーワード（小文字・トリム済み） */
    this.query = "";

    /** デバウンス用タイマーID */
    this._debounceTimer = null;
  }

  /* --------------------------------------------------
     クエリの設定
  -------------------------------------------------- */

  /**
   * 検索キーワードを設定する
   * @param {string} query
   */
  setQuery(query) {
    this.query = (query || "").trim().toLowerCase();
  }

  /** 検索キーワードが入力されているか */
  hasQuery() {
    return this.query.length > 0;
  }

  /** 検索条件をクリア */
  clear() {
    this.query = "";
  }

  /* --------------------------------------------------
     検索の実行
  -------------------------------------------------- */

  /**
   * 技術データ配列にキーワード検索を適用する
   * 検索対象：技術名 / 概要 / 説明 / キーワード / カテゴリ
   * スペース区切りの複数語はAND条件で扱う
   * @param {Array} technologies
   * @returns {Array}
   */
  apply(technologies) {
    if (!this.hasQuery()) {
      return technologies;
    }

    // 全角・半角スペースで語を分割（複数キーワードAND検索）
    const terms = this.query.split(/[\s　]+/).filter(Boolean);

    return technologies.filter((tech) => {
      const haystack = this._buildHaystack(tech);
      // すべての語が含まれていればヒット（AND）
      return terms.every((term) => haystack.includes(term));
    });
  }

  /* --------------------------------------------------
     リアルタイム検索（デバウンス）
  -------------------------------------------------- */

  /**
   * 入力のたびに即実行せず、一定時間後にコールバックを呼ぶ
   * 大量データでも快適に動くよう負荷を抑える
   * @param {Function} callback
   * @param {number} delay ミリ秒
   */
  debounce(callback, delay = 180) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(callback, delay);
  }

  /* --------------------------------------------------
     内部ヘルパー
  -------------------------------------------------- */

  /**
   * 1件の技術データから検索対象文字列を組み立てる
   * @param {Object} tech
   * @returns {string} 小文字化した連結文字列
   */
  _buildHaystack(tech) {
    const parts = [
      tech.name,
      tech.summary,
      tech.description,
      tech.department,
      tech.owner,
    ];

    // 配列項目（カテゴリ・キーワード）を展開して追加
    const arrays = [tech.category, tech.keywords];
    arrays.forEach((arr) => {
      if (Array.isArray(arr)) {
        parts.push(arr.join(" "));
      } else if (arr) {
        parts.push(String(arr));
      }
    });

    return parts.filter(Boolean).join(" ").toLowerCase();
  }
}
