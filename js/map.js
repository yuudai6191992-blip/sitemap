/* ============================================================
   map.js
   --------------------------------------------------------
   PanZoomController … マップの移動（パン）・拡大縮小（ズーム）・3D回転
   MapManager        … ゾーンラベルと技術ピンの描画・絞り込み反映
   ============================================================ */

/* ============================================================
   PanZoomController
   --------------------------------------------------------
   責務：
     - ドラッグ／タッチによるマップの移動と3D回転（グルグル）
     - ホイール／ピンチ／ボタン／キーボードによる拡大縮小
     - 立体／平面表示の切り替え
     - 表示範囲がビューポートから外れすぎないよう補正する
   ============================================================ */
class PanZoomController {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.viewport 外枠（perspective を持つ・はみ出しを隠す）
   * @param {HTMLElement} options.world    移動・回転・拡大縮小の対象
   * @param {(state:Object)=>void} [options.onChange] 状態変化の通知
   */
  constructor({ viewport, world, onChange }) {
    this.viewport = viewport;
    this.world = world;
    this.onChange = onChange || (() => {});

    // --- 表示状態 ---
    this.scale = 1;      // 倍率
    this.x = 0;          // 中心からの平行移動量[px]
    this.y = 0;
    this.spin = 0;       // Z軸まわりの回転（グルグル）[deg]
    this.tilt = 0;       // X軸まわりの傾き（0=真上から見た平面）[deg]
    this.is3d = false;   // 立体表示かどうか

    this.minScale = 0.6;
    this.maxScale = 4;
    this.maxTilt = 72;   // 傾けすぎて地面が潰れないよう上限を設ける
    this.TILT_3D = 52;   // 立体表示にしたときの既定の傾き

    // --- 入力状態 ---
    this._mode = null;   // 'rotate' | 'pan'
    this._start = null;
    this._pointers = new Map();
    this._pinchStartDist = 0;
    this._pinchStartScale = 1;
    this._pinchStartCenter = null;

    this._bind();
    this.apply();
  }

  /* --------------------------------------------------
     イベント登録
  -------------------------------------------------- */
  _bind() {
    const vp = this.viewport;
    vp.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    vp.addEventListener("pointermove", (e) => this._onPointerMove(e));
    vp.addEventListener("pointerup", (e) => this._onPointerUp(e));
    vp.addEventListener("pointercancel", (e) => this._onPointerUp(e));
    // 右ドラッグを移動に使うため、右クリックメニューは抑止
    vp.addEventListener("contextmenu", (e) => e.preventDefault());

    vp.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
      },
      { passive: false }
    );

    vp.addEventListener("keydown", (e) => this._onKeyDown(e));
    window.addEventListener("resize", () => this._clamp(true));
  }

  /* --------------------------------------------------
     ポインタ操作
       立体表示：ドラッグ＝回転／Shift・右ボタン＝移動
       平面表示：ドラッグ＝移動
  -------------------------------------------------- */
  _onPointerDown(e) {
    // ピンやボタンから始まった操作はクリックを優先する
    if (e.target.closest(".map-pin, .map-zone, .map-ctrl")) return;

    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.viewport.setPointerCapture(e.pointerId);
    this.world.classList.remove("is-animating");

    if (this._pointers.size === 1) {
      const wantPan = !this.is3d || e.shiftKey || e.button === 1 || e.button === 2;
      this._mode = wantPan ? "pan" : "rotate";
      this._start = {
        px: e.clientX, py: e.clientY,
        x: this.x, y: this.y, spin: this.spin, tilt: this.tilt,
      };
      this.viewport.classList.add(wantPan ? "is-panning" : "is-rotating");
    } else if (this._pointers.size === 2) {
      // 2本指：ピンチ＝拡大縮小、平行移動＝マップ移動
      this._mode = "pinch";
      this._pinchStartDist = this._pointerDistance();
      this._pinchStartScale = this.scale;
      this._pinchStartCenter = this._pointerCenter();
      this._start = { x: this.x, y: this.y };
      this.viewport.classList.remove("is-rotating");
      this.viewport.classList.add("is-panning");
    }
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._mode === "pinch" && this._pointers.size === 2) {
      const dist = this._pointerDistance();
      const center = this._pointerCenter();
      if (this._pinchStartDist > 0) {
        this.zoomTo(this._pinchStartScale * (dist / this._pinchStartDist), center.x, center.y);
      }
      // 2本指の平行移動でマップも動かす
      this.x += center.x - this._pinchStartCenter.x;
      this.y += center.y - this._pinchStartCenter.y;
      this._pinchStartCenter = center;
      this._clamp();
      return;
    }

    if (!this._start || this._pointers.size !== 1) return;
    const dx = e.clientX - this._start.px;
    const dy = e.clientY - this._start.py;

    if (this._mode === "rotate") {
      // 横ドラッグ＝Z軸回転（グルグル）／縦ドラッグ＝傾きの調整
      this.spin = this._start.spin + dx * 0.4;
      this.tilt = Math.max(0, Math.min(this.maxTilt, this._start.tilt + dy * 0.3));
      this.apply();
    } else {
      this.x = this._start.x + dx;
      this.y = this._start.y + dy;
      this._clamp();
    }
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinchStartDist = 0;
    if (this._pointers.size === 0) {
      this._mode = null;
      this._start = null;
      this.viewport.classList.remove("is-panning", "is-rotating");
    }
  }

  /**
   * 変換前（レイアウト上）のワールド中心を画面座標で返す。
   * ワールドはビューポート下端揃えなので、ビューポート中心とは一致しない。
   */
  _layoutCenter() {
    const r = this.viewport.getBoundingClientRect();
    return {
      x: r.left + this.world.offsetLeft + this.world.offsetWidth / 2,
      y: r.top + this.world.offsetTop + this.world.offsetHeight / 2,
    };
  }

  _pointerDistance() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _pointerCenter() {
    const [a, b] = [...this._pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* --------------------------------------------------
     キーボード操作
  -------------------------------------------------- */
  _onKeyDown(e) {
    const step = 60;
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // Shift＋左右＝回転
      e.preventDefault();
      this.rotateBy(e.key === "ArrowLeft" ? -15 : 15);
      return;
    }
    const move = {
      ArrowUp: [0, step], ArrowDown: [0, -step],
      ArrowLeft: [step, 0], ArrowRight: [-step, 0],
    };
    if (move[e.key]) {
      e.preventDefault();
      this.x += move[e.key][0];
      this.y += move[e.key][1];
      this._clamp(true);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault(); this.zoomByButton(1.3);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault(); this.zoomByButton(1 / 1.3);
    } else if (e.key === "0") {
      e.preventDefault(); this.reset(true);
    }
  }

  /* --------------------------------------------------
     ズーム
  -------------------------------------------------- */
  zoomAt(factor, clientX, clientY) {
    this.zoomTo(this.scale * factor, clientX, clientY);
  }

  /**
   * 指定倍率へ。基準点（画面座標）がなるべく動かないよう平行移動量を補正する
   */
  zoomTo(target, clientX, clientY) {
    const next = Math.min(this.maxScale, Math.max(this.minScale, target));
    if (next === this.scale) return;

    // 変換の基準は要素の中心（transform-origin: 50% 50%）
    const lc = this._layoutCenter();
    const cx = lc.x + this.x;
    const cy = lc.y + this.y;
    const k = next / this.scale;

    this.x += (clientX - cx) * (1 - k);
    this.y += (clientY - cy) * (1 - k);
    this.scale = next;
    this._clamp();
  }

  zoomByButton(factor) {
    const rect = this.viewport.getBoundingClientRect();
    this.world.classList.add("is-animating");
    this.zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  /* --------------------------------------------------
     回転・立体表示
  -------------------------------------------------- */

  /** 相対的に回転する（ボタン・キーボード用） */
  rotateBy(deg) {
    // 平面のままだと回転が分かりにくいので、自動で立体表示にする
    if (!this.is3d) return this.set3d(true, this.spin + deg);
    this.world.classList.add("is-animating");
    this.spin += deg;
    this.apply();
  }

  /**
   * 立体／平面を切り替える
   * @param {boolean} on
   * @param {number} [spin] 同時に指定したい回転角
   */
  set3d(on, spin) {
    this.world.classList.add("is-animating");
    this.is3d = on;
    this.tilt = on ? this.TILT_3D : 0;
    this.spin = on ? (spin !== undefined ? spin : this.spin) : 0;
    // 傾けると縦に潰れて見えるため、立体表示では少し拡大して見栄えを整える
    this.scale = on ? Math.max(this.scale, 1.2) : 1;
    this.x = 0;
    // 立体表示では板の中心をビューポート中央へ寄せて、回転の中心を見やすくする
    if (on) {
      const r = this.viewport.getBoundingClientRect();
      this.y = (r.top + r.height / 2) - this._layoutCenter().y;
    } else {
      this.y = 0;
    }
    this._clamp(true);
    return this.is3d;
  }

  /** 全体表示に戻す（平面・等倍・回転なし） */
  reset(animate = false) {
    if (animate) this.world.classList.add("is-animating");
    this.is3d = false;
    this.scale = 1;
    this.x = 0; this.y = 0;
    this.spin = 0; this.tilt = 0;
    this._clamp(animate);
  }

  /* --------------------------------------------------
     反映・補正
  -------------------------------------------------- */

  /**
   * マップの中心がビューポート内に留まるよう補正して反映する
   * （回転すると外形が複雑になるため、中心位置で制御する）
   */
  _clamp(animate = false) {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    const mx = vw * 0.42;  // 中心が画面外へ出過ぎない範囲
    const my = vh * 0.42;

    this.x = Math.max(-mx, Math.min(mx, this.x));
    this.y = Math.max(-my, Math.min(my, this.y));

    if (animate) this.world.classList.add("is-animating");
    this.apply();
  }

  /** transform を実際に適用する */
  apply() {
    this.world.style.transform =
      `translate(${this.x}px, ${this.y}px) ` +
      `rotateX(${this.tilt}deg) rotateZ(${this.spin}deg) scale(${this.scale})`;

    // ピンが常に正面を向くよう、親の回転を打ち消す角度を渡す
    this.world.style.setProperty("--counter-spin", `${-this.spin}deg`);
    this.world.style.setProperty("--counter-tilt", `${-this.tilt}deg`);

    this.onChange({
      scale: this.scale, spin: this.spin, tilt: this.tilt, is3d: this.is3d,
    });
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
  /** アンカー要素の基準サイズ[px]（奥行き推定に使用） */
  static ANCHOR_SIZE = 40;

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
    this.anchorsEl = document.getElementById("map-anchors");
    this.viewportEl = document.getElementById("map-viewport");
    this.scaleEl = document.getElementById("map-scale");

    /** id → ピン要素 の参照マップ */
    this.pinById = new Map();
    /** id → アンカー要素（3D空間内の基準点） */
    this.anchorById = new Map();
    /** 位置同期の多重実行を防ぐフラグ */
    this._syncQueued = false;
    /** zoneKey → チップ要素 の参照マップ */
    this.zoneChipById = new Map();
    /** zoneKey → 色 の対応表 */
    this._zoneColor = new Map();

    this.view3dBtn = document.getElementById("view-3d");

    // 移動・回転・拡大縮小のコントローラを初期化
    this.panzoom = new PanZoomController({
      viewport: document.getElementById("map-viewport"),
      world: document.getElementById("map-world"),
      onChange: (state) => this._onViewChange(state),
    });

    // 操作ボタン
    document.getElementById("zoom-in")
      .addEventListener("click", () => this.panzoom.zoomByButton(1.4));
    document.getElementById("zoom-out")
      .addEventListener("click", () => this.panzoom.zoomByButton(1 / 1.4));
    document.getElementById("zoom-reset")
      .addEventListener("click", () => this.panzoom.reset(true));
    document.getElementById("rot-left")
      .addEventListener("click", () => this.panzoom.rotateBy(-20));
    document.getElementById("rot-right")
      .addEventListener("click", () => this.panzoom.rotateBy(20));
    this.view3dBtn
      .addEventListener("click", () => this.panzoom.set3d(!this.panzoom.is3d));

    // アニメーション中・画面リサイズ時もピン位置を追従させる
    const world = document.getElementById("map-world");
    world.addEventListener("transitionrun", () => this._followTransition());
    world.addEventListener("transitionend", () => this.syncPins());
    window.addEventListener("resize", () => this.requestPinSync());
    window.addEventListener("scroll", () => this.requestPinSync(), { passive: true });
  }

  /** CSSトランジション中、終了までピン位置を追従させる */
  _followTransition() {
    const step = () => {
      this.syncPins();
      if (this._following) requestAnimationFrame(step);
    };
    if (this._following) return;
    this._following = true;
    requestAnimationFrame(step);
    // トランジション時間（0.32s）より少し長めに追従して停止する
    clearTimeout(this._followTimer);
    this._followTimer = setTimeout(() => {
      this._following = false;
      this.syncPins();
    }, 420);
  }

  /* --------------------------------------------------
     表示状態の変化時：倍率表示・ピンの見た目・立体ボタンを更新
  -------------------------------------------------- */
  _onViewChange({ scale, is3d }) {
    // 倍率表示
    this.scaleEl.textContent = `${Math.round(scale * 100)}%`;

    // 地図の変形に追従してピンを配置し直す
    this.requestPinSync();

    // 立体／平面ボタンの状態
    this.view3dBtn.textContent = is3d ? "平面" : "立体";
    this.view3dBtn.setAttribute("aria-pressed", is3d ? "true" : "false");
    this.view3dBtn.setAttribute("aria-label", is3d ? "平面表示に切り替え" : "立体表示に切り替え");
    document.getElementById("map-viewport").classList.toggle("is-3d", is3d);
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
    const anchorFrag = document.createDocumentFragment();

    technologies.forEach((tech, index) => {
      const pos = tech.pos || { x: 50, y: 50 };
      const color = this._zoneColor.get(tech.zone) || "#1466b8";

      // 3D空間内の基準点（見えない）。投影位置と奥行きの計測に使う
      const anchor = document.createElement("div");
      anchor.className = "map-anchor";
      anchor.style.left = `${pos.x}%`;
      anchor.style.top = `${pos.y}%`;
      this.anchorById.set(tech.id, anchor);
      anchorFrag.appendChild(anchor);

      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "map-pin";
      pin.dataset.id = tech.id;
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
    this.anchorsEl.innerHTML = "";
    this.anchorsEl.appendChild(anchorFrag);

    this.syncPins();
  }

  /* --------------------------------------------------
     ピンの位置同期
       3D空間のアンカーが画面上のどこに投影されたかを読み取り、
       平面レイヤーのピンをその位置へ移動させる。
       これにより回転してもピンは正面を向き、当たり判定もズレない。
  -------------------------------------------------- */
  syncPins() {
    const vp = this.viewportEl.getBoundingClientRect();

    this.anchorById.forEach((anchor, id) => {
      const pin = this.pinById.get(id);
      if (!pin) return;

      const r = anchor.getBoundingClientRect();
      const cx = r.left + r.width / 2 - vp.left;
      const cy = r.top + r.height / 2 - vp.top;

      // アンカーの投影サイズから奥行きを推定し、遠いピンは少し小さく見せる
      // （平方根で効果を弱め、極端に大小しないよう上下限を設ける）
      const depth = Math.max(
        0.72,
        Math.min(1.22, Math.sqrt(r.width / MapManager.ANCHOR_SIZE))
      );

      pin.style.left = `${cx}px`;
      pin.style.top = `${cy}px`;
      pin.style.setProperty("--pin-depth", depth.toFixed(3));
      // 手前（画面下）のピンを前面に描画する
      pin.style.zIndex = String(1000 + Math.round(cy));

      // ビューポート外へ出たピンは操作対象から外す
      const outside = cx < -40 || cy < -40 || cx > vp.width + 40 || cy > vp.height + 40;
      pin.classList.toggle("is-offscreen", outside);
    });
  }

  /** 次の描画フレームで一度だけ位置同期する（連続操作時の負荷を抑える） */
  requestPinSync() {
    if (this._syncQueued) return;
    this._syncQueued = true;
    requestAnimationFrame(() => {
      this._syncQueued = false;
      this.syncPins();
    });
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
