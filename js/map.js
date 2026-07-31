/* ============================================================
   map.js
   MapManager クラス
   --------------------------------------------------------
   責務：
     - 風景マップ上への「ゾーンラベル」と「技術ピン」の描画
     - ピンのクリックで詳細を開く（コールバック）
     - ゾーンチップのクリックで絞り込み（コールバック）
     - 検索・フィルタ結果に応じてピンの表示/減光を切り替える
   ============================================================ */

class MapManager {
  /**
   * @param {Object} options
   * @param {(id:number)=>void} options.onPinClick  ピンクリック時
   * @param {(zoneKey:string)=>void} options.onZoneToggle ゾーンチップクリック時
   */
  constructor({ onPinClick, onZoneToggle }) {
    this.onPinClick = onPinClick;
    this.onZoneToggle = onZoneToggle;

    this.zonesEl = document.getElementById("map-zones");
    this.pinsEl = document.getElementById("map-pins");

    /** id → ピン要素 の参照マップ */
    this.pinById = new Map();
    /** zoneKey → チップ要素 の参照マップ */
    this.zoneChipById = new Map();
    /** zoneKey → 色 の対応表 */
    this._zoneColor = new Map();
  }

  /* --------------------------------------------------
     初期描画（ゾーン＋ピン）
  -------------------------------------------------- */

  /**
   * @param {Array} technologies 全技術データ
   * @param {Array} zones        ゾーン定義（key/label/icon/color）
   * @param {Map<string,number>} zoneCounts ゾーン別件数
   */
  render(technologies, zones, zoneCounts) {
    // ゾーン色の対応表を先に構築（ピンのリング色に使用）
    zones.forEach((z) => this._zoneColor.set(z.key, z.color));

    this._renderZones(zones, zoneCounts);
    this._renderPins(technologies);
  }

  /* --------------------------------------------------
     ゾーンラベル（風景上部の白いチップ）
  -------------------------------------------------- */
  _renderZones(zones, zoneCounts) {
    const frag = document.createDocumentFragment();

    zones.forEach((zone) => {
      const count = zoneCounts.get(zone.key) || 0;

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "map-zone";
      chip.dataset.zone = zone.key;
      chip.setAttribute("aria-pressed", "false");
      chip.style.setProperty("--zone-color", zone.color);

      // 件数が0のゾーンは押せないように（将来のデータ登録用の枠として表示）
      if (count === 0) {
        chip.disabled = true;
        chip.classList.add("is-empty");
      }

      chip.innerHTML = `
        <span class="map-zone__icon" aria-hidden="true">${zone.icon}</span>
        <span class="map-zone__label">${this._esc(zone.label)}</span>
        <span class="map-zone__count">${count}</span>`;

      chip.addEventListener("click", () => this.onZoneToggle(zone.key));

      this.zoneChipById.set(zone.key, chip);
      frag.appendChild(chip);
    });

    this.zonesEl.innerHTML = "";
    this.zonesEl.appendChild(frag);
  }

  /* --------------------------------------------------
     技術ピン
  -------------------------------------------------- */
  _renderPins(technologies) {
    const frag = document.createDocumentFragment();

    technologies.forEach((tech, index) => {
      const pos = tech.pos || { x: 50, y: 50 };
      const color = this._zoneColor.get(tech.zone) || "#1466b8";

      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "map-pin";
      pin.dataset.id = tech.id;
      pin.style.left = `${pos.x}%`;
      pin.style.top = `${pos.y}%`;
      pin.style.setProperty("--pin-color", color);
      // 浮遊アニメーションの位相をずらす（一斉に動かない）
      pin.style.setProperty("--pin-delay", `${(index % 6) * 0.4}s`);
      pin.setAttribute("aria-label", `${this._esc(tech.name)} の詳細を表示`);

      // __disc に浮遊アニメーション、__pin 側にホバー拡大を分担させ、
      // transform の競合を避ける（内外で別要素にする）
      pin.innerHTML = `
        <span class="map-pin__disc">
          <span class="map-pin__icon" aria-hidden="true">${tech.icon || "📍"}</span>
        </span>
        <span class="map-pin__label">${this._esc(tech.name)}</span>`;

      pin.addEventListener("click", () => this.onPinClick(tech.id));

      this.pinById.set(tech.id, pin);
      frag.appendChild(pin);
    });

    this.pinsEl.innerHTML = "";
    this.pinsEl.appendChild(frag);
  }

  /* --------------------------------------------------
     検索・フィルタ結果の反映（該当ピンのみ強調）
  -------------------------------------------------- */

  /**
   * @param {Set<number>} visibleIds 表示（強調）する技術ID
   */
  update(visibleIds) {
    this.pinById.forEach((pin, id) => {
      const isVisible = visibleIds.has(id);
      pin.classList.toggle("is-dim", !isVisible);
      // 減光中のピンはキーボード操作・読み上げの対象から外す
      pin.tabIndex = isVisible ? 0 : -1;
      pin.setAttribute("aria-hidden", isVisible ? "false" : "true");
    });
  }

  /**
   * ゾーンチップの選択状態（見た目）を更新
   * @param {Set<string>} selectedZones
   */
  updateZoneStates(selectedZones) {
    this.zoneChipById.forEach((chip, key) => {
      const on = selectedZones.has(key);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      chip.classList.toggle("is-active", on);
    });
  }

  /* --------------------------------------------------
     内部ヘルパー
  -------------------------------------------------- */
  _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
