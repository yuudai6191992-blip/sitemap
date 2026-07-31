/* ============================================================
   map.js
   --------------------------------------------------------
   PanZoomController … マップの移動（パン）・拡大縮小（ズーム）
   MapManager        … ゾーンラベルと技術ピンの描画・絞り込み反映
   ============================================================ */

/* ============================================================
   PanZoomController
   --------------------------------------------------------
   責務：
     - ドラッグ／タッチによるマップの移動
     - ホイール／ピンチ／ボタン／キーボードによる拡大縮小
     - 表示範囲がビューポートから外れすぎないよう補正する
   ============================================================ */
class PanZoomController {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.viewport 外枠（はみ出しを隠す要素）
   * @param {HTMLElement} options.stage    移動・拡大縮小の対象
   * @param {(scale:number)=>void} [options.onChange] 倍率変更時の通知
   */
  constructor({ viewport, stage, onChange }) {
    this.viewport = viewport;
    this.stage = stage;
    this.onChange = onChange || (() => {});

    // 現在の変換状態（scale＝倍率、x/y＝平行移動量[px]）
    this.scale = 1;
    this.x = 0;
    this.y = 0;

    // 倍率の下限・上限
    this.minScale = 1;
    this.maxScale = 4;

    // ドラッグ状態
    this._dragging = false;
    this._start = { x: 0, y: 0, tx: 0, ty: 0 };
    // 複数タッチ（ピンチ）管理
    this._pointers = new Map();
    this._pinchStartDist = 0;
    this._pinchStartScale = 1;

    this._bind();
    this.reset();
  }

  /* --------------------------------------------------
     イベント登録
  -------------------------------------------------- */
  _bind() {
    const vp = this.viewport;

    // --- ドラッグ／ピンチ（Pointer Events で統一的に扱う） ---
    vp.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    vp.addEventListener("pointermove", (e) => this._onPointerMove(e));
    vp.addEventListener("pointerup", (e) => this._onPointerUp(e));
    vp.addEventListener("pointercancel", (e) => this._onPointerUp(e));

    // --- ホイールで拡大縮小（ページスクロールは抑止） ---
    vp.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // 上スクロールで拡大、下スクロールで縮小
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.zoomAt(factor, e.clientX, e.clientY);
      },
      { passive: false }
    );

    // --- キーボード操作（アクセシビリティ） ---
    vp.addEventListener("keydown", (e) => this._onKeyDown(e));

    // ウィンドウ幅が変わったら位置を補正
    window.addEventListener("resize", () => this._clamp(true));
  }

  /* --------------------------------------------------
     ポインタ操作
  -------------------------------------------------- */
  _onPointerDown(e) {
    // ピン・ボタン上から始まったドラッグはパンにしない（クリックを優先）
    if (e.target.closest(".map-pin, .map-zone, .map-ctrl")) return;

    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.viewport.setPointerCapture(e.pointerId);

    if (this._pointers.size === 1) {
      // 単指・マウス → パン開始
      this._dragging = true;
      this._start = { x: e.clientX, y: e.clientY, tx: this.x, ty: this.y };
      this.viewport.classList.add("is-panning");
      this.stage.classList.remove("is-animating");
    } else if (this._pointers.size === 2) {
      // 2本指 → ピンチ開始
      this._dragging = false;
      this._pinchStartDist = this._pointerDistance();
      this._pinchStartScale = this.scale;
    }
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 2) {
      // --- ピンチズーム ---
      const dist = this._pointerDistance();
      if (this._pinchStartDist > 0) {
        const target = this._pinchStartScale * (dist / this._pinchStartDist);
        const center = this._pointerCenter();
        this.zoomTo(target, center.x, center.y);
      }
      return;
    }

    if (!this._dragging) return;

    // --- パン（ドラッグ移動） ---
    this.x = this._start.tx + (e.clientX - this._start.x);
    this.y = this._start.ty + (e.clientY - this._start.y);
    this._clamp();
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinchStartDist = 0;
    if (this._pointers.size === 0) {
      this._dragging = false;
      this.viewport.classList.remove("is-panning");
    }
  }

  /** 2点間の距離（ピンチ判定用） */
  _pointerDistance() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** 2点の中心座標（ピンチの基準点） */
  _pointerCenter() {
    const [a, b] = [...this._pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* --------------------------------------------------
     キーボード操作
  -------------------------------------------------- */
  _onKeyDown(e) {
    const step = 60; // 矢印キーの移動量[px]
    const keys = {
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
    };

    if (keys[e.key]) {
      e.preventDefault();
      this.x += keys[e.key][0];
      this.y += keys[e.key][1];
      this._clamp(true);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      this.zoomByButton(1.3);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      this.zoomByButton(1 / 1.3);
    } else if (e.key === "0") {
      e.preventDefault();
      this.reset(true);
    }
  }

  /* --------------------------------------------------
     ズーム操作
  -------------------------------------------------- */

  /**
   * 画面上の指定座標を基準に、倍率を factor 倍する
   * @param {number} factor 倍率の係数
   * @param {number} clientX 基準点（画面座標）
   * @param {number} clientY 基準点（画面座標）
   */
  zoomAt(factor, clientX, clientY) {
    this.zoomTo(this.scale * factor, clientX, clientY);
  }

  /**
   * 指定倍率へ変更する。基準点の位置が動かないよう平行移動量を補正する
   * @param {number} target 目標倍率
   * @param {number} clientX 基準点（画面座標）
   * @param {number} clientY 基準点（画面座標）
   */
  zoomTo(target, clientX, clientY) {
    const next = this._clampScale(target);
    if (next === this.scale) return;

    const rect = this.viewport.getBoundingClientRect();
    // ビューポート内でのカーソル位置
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    // 拡大前後で「カーソル下の点」が動かないように x/y を補正
    const ratio = next / this.scale;
    this.x = px - (px - this.x) * ratio;
    this.y = py - (py - this.y) * ratio;
    this.scale = next;

    this.stage.classList.remove("is-animating");
    this._clamp();
  }

  /** ボタン・キーボード用：ビューポート中心を基準にズーム */
  zoomByButton(factor) {
    const rect = this.viewport.getBoundingClientRect();
    this.stage.classList.add("is-animating");
    this.zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  /** 全体表示に戻す */
  reset(animate = false) {
    if (animate) this.stage.classList.add("is-animating");
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this._clamp(animate);
  }

  /* --------------------------------------------------
     反映・補正
  -------------------------------------------------- */

  /** 倍率を上下限に収める */
  _clampScale(value) {
    return Math.min(this.maxScale, Math.max(this.minScale, value));
  }

  /**
   * マップがビューポートから外れすぎないよう平行移動量を補正して反映
   * @param {boolean} animate アニメーションさせるか
   */
  _clamp(animate = false) {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    // 等倍時のステージ寸法（CSSのaspect-ratioで決まる）
    const sw = this.stage.offsetWidth * this.scale;
    const sh = this.stage.offsetHeight * this.scale;

    // 画面より小さい方向は中央寄せ、大きい方向は端が内側に入らないよう制限
    this.x = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, this.x));
    this.y = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, this.y));

    if (animate) this.stage.classList.add("is-animating");
    this._apply();
  }

  /** transform を実際に適用する */
  _apply() {
    this.stage.style.transform =
      `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    this.onChange(this.scale);
  }
}

/* ============================================================
   MapManager
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
    this.scaleEl = document.getElementById("map-scale");

    /** id → ピン要素 の参照マップ */
    this.pinById = new Map();
    /** zoneKey → チップ要素 の参照マップ */
    this.zoneChipById = new Map();
    /** zoneKey → 色 の対応表 */
    this._zoneColor = new Map();

    // 移動・拡大縮小のコントローラを初期化
    this.panzoom = new PanZoomController({
      viewport: document.getElementById("map-viewport"),
      stage: document.getElementById("map-stage"),
      onChange: (scale) => this._onScaleChange(scale),
    });

    // 拡大縮小ボタン
    document
      .getElementById("zoom-in")
      .addEventListener("click", () => this.panzoom.zoomByButton(1.4));
    document
      .getElementById("zoom-out")
      .addEventListener("click", () => this.panzoom.zoomByButton(1 / 1.4));
    document
      .getElementById("zoom-reset")
      .addEventListener("click", () => this.panzoom.reset(true));
  }

  /* --------------------------------------------------
     倍率変更時：表示と、ピンの見た目サイズを調整
  -------------------------------------------------- */
  _onScaleChange(scale) {
    // 倍率表示
    this.scaleEl.textContent = `${Math.round(scale * 100)}%`;

    // ピンは拡大しすぎると巨大になるため、逆スケールで見た目を一定に近づける
    // （1.0 では等倍、拡大時は少しだけ大きくなる程度に抑える）
    const counter = 1 / Math.pow(scale, 0.72);
    this.pinsEl.style.setProperty("--pin-counter-scale", counter);
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
