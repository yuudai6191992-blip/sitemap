/* ============================================================
   filter.js
   FilterManager クラス
   --------------------------------------------------------
   責務：
     - カテゴリの複数選択状態を保持する
     - ソート条件を保持する
     - 技術データ配列に対して「カテゴリ絞り込み」と
       「並び替え」を適用する
   ※ 検索（全文検索）は SearchManager が担当し、責務を分離する
   ============================================================ */

class FilterManager {
  constructor() {
    /** @type {Set<string>} 選択中のカテゴリ（複数選択可） */
    this.selectedCategories = new Set();

    /** @type {Set<string>} 選択中のゾーン（風景マップのエリア／複数選択可） */
    this.selectedZones = new Set();

    /** @type {string} 現在のソートキー（name / category / newest） */
    this.sortKey = "name";
  }

  /* --------------------------------------------------
     カテゴリ選択の操作
  -------------------------------------------------- */

  /**
   * カテゴリの選択状態をトグルする
   * @param {string} category
   * @returns {boolean} トグル後に「選択中」なら true
   */
  toggleCategory(category) {
    if (this.selectedCategories.has(category)) {
      this.selectedCategories.delete(category);
      return false;
    }
    this.selectedCategories.add(category);
    return true;
  }

  /** 指定カテゴリが選択中かどうか */
  isSelected(category) {
    return this.selectedCategories.has(category);
  }

  /** 選択カテゴリをすべて解除する */
  clearCategories() {
    this.selectedCategories.clear();
  }

  /** 選択中カテゴリを配列で返す */
  getSelectedCategories() {
    return [...this.selectedCategories];
  }

  /* --------------------------------------------------
     ゾーン選択の操作（風景マップのエリア）
  -------------------------------------------------- */

  /**
   * ゾーンの選択状態をトグルする
   * @param {string} zoneKey
   * @returns {boolean} トグル後に「選択中」なら true
   */
  toggleZone(zoneKey) {
    if (this.selectedZones.has(zoneKey)) {
      this.selectedZones.delete(zoneKey);
      return false;
    }
    this.selectedZones.add(zoneKey);
    return true;
  }

  /** 選択ゾーンをすべて解除する */
  clearZones() {
    this.selectedZones.clear();
  }

  /** 選択中ゾーンを配列で返す */
  getSelectedZones() {
    return [...this.selectedZones];
  }

  /**
   * ゾーン絞り込みを適用する（選択ゾーンのいずれかに属するものを残す）
   * @param {Array} technologies
   * @returns {Array}
   */
  applyZoneFilter(technologies) {
    if (this.selectedZones.size === 0) {
      return technologies;
    }
    return technologies.filter((tech) => this.selectedZones.has(tech.zone));
  }

  /* --------------------------------------------------
     ソート条件の操作
  -------------------------------------------------- */

  /** ソートキーを設定する */
  setSort(sortKey) {
    this.sortKey = sortKey;
  }

  /* --------------------------------------------------
     フィルタ・ソートの適用
  -------------------------------------------------- */

  /**
   * カテゴリ絞り込みを適用する
   * 技術データの category は配列（複数分野に属する場合がある）
   * 選択カテゴリのいずれかを含むものを残す（OR条件）
   * @param {Array} technologies
   * @returns {Array}
   */
  applyCategoryFilter(technologies) {
    if (this.selectedCategories.size === 0) {
      return technologies; // 未選択なら全件
    }
    return technologies.filter((tech) =>
      this._asArray(tech.category).some((cat) =>
        this.selectedCategories.has(cat)
      )
    );
  }

  /**
   * 並び替えを適用する（元配列は破壊しない）
   * @param {Array} technologies
   * @returns {Array}
   */
  applySort(technologies) {
    const list = [...technologies];

    switch (this.sortKey) {
      case "name":
        // 名称の五十音・アルファベット順（日本語ロケール）
        return list.sort((a, b) =>
          a.name.localeCompare(b.name, "ja")
        );

      case "category":
        // 代表カテゴリ（先頭）で並べ、同カテゴリ内は名称順
        return list.sort((a, b) => {
          const catA = this._primaryCategory(a);
          const catB = this._primaryCategory(b);
          const byCat = catA.localeCompare(catB, "ja");
          return byCat !== 0 ? byCat : a.name.localeCompare(b.name, "ja");
        });

      case "newest":
        // 登録日の新しい順。日付が無い場合は末尾へ
        return list.sort((a, b) => {
          const dateA = a.registered || "";
          const dateB = b.registered || "";
          return dateB.localeCompare(dateA);
        });

      default:
        return list;
    }
  }

  /* --------------------------------------------------
     内部ヘルパー
  -------------------------------------------------- */

  /** category が文字列でも配列でも、必ず配列に正規化する */
  _asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  /** 代表カテゴリ（配列先頭）を取得 */
  _primaryCategory(tech) {
    const arr = this._asArray(tech.category);
    return arr.length > 0 ? arr[0] : "";
  }
}
