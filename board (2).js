/* =============================================================
   QUADRO SEMANAL (rotina fixa)
   -------------------------------------------------------------
   renderBoard(blocksByDay, todayDay) → devolve um elemento DOM
   pronto para ser inserido na página.

   blocksByDay: { 1: [bloco, ...], 2: [...], ..., 6: [...] }
                (use groupBlocksByDay() de supabase-client.js)
   todayDay:    new Date().getDay()  (0=Dom ... 6=Sáb)
   ============================================================= */

const BOARD_START_HOUR = 7;  // 07:00
const BOARD_END_HOUR = 19;   // 19:00
const HOUR_PX = 50;
const BOARD_HEIGHT = (BOARD_END_HOUR - BOARD_START_HOUR) * HOUR_PX;
const DAY_ORDER = [1, 2, 3, 4, 5, 6];

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function topPx(start) {
  return ((timeToMinutes(start) - BOARD_START_HOUR * 60) / 60) * HOUR_PX;
}

function heightPx(start, end) {
  return ((timeToMinutes(end) - timeToMinutes(start)) / 60) * HOUR_PX;
}

function renderLegend(container) {
  Object.entries(BLOCK_TYPES).forEach(([type, label]) => {
    const item = document.createElement("span");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch" + (type === "pausa" ? " pausa" : "");
    if (type !== "pausa") swatch.style.background = `var(--type-${type})`;

    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    container.appendChild(item);
  });
}

function renderBoard(blocksByDay, todayDay) {
  const wrapper = document.createElement("div");
  wrapper.className = "board-wrapper";

  const grid = document.createElement("div");
  grid.className = "board-grid";

  // Cabeçalho (linha de dias)
  const corner = document.createElement("div");
  corner.className = "board-header-cell corner";
  grid.appendChild(corner);

  DAY_ORDER.forEach(day => {
    const cell = document.createElement("div");
    cell.className = "board-header-cell" + (day === todayDay ? " today" : "");
    cell.textContent = DAY_LABELS_SHORT[day];
    grid.appendChild(cell);
  });

  // Eixo de horários
  const axis = document.createElement("div");
  axis.className = "time-axis";
  axis.style.height = BOARD_HEIGHT + "px";
  for (let h = BOARD_START_HOUR; h <= BOARD_END_HOUR; h++) {
    const label = document.createElement("span");
    label.style.top = (h - BOARD_START_HOUR) * HOUR_PX + "px";
    label.textContent = String(h).padStart(2, "0") + ":00";
    axis.appendChild(label);
  }
  grid.appendChild(axis);

  // Colunas dos dias
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  DAY_ORDER.forEach(day => {
    const col = document.createElement("div");
    col.className = "day-col" + (day === todayDay ? " today" : "");
    col.style.height = BOARD_HEIGHT + "px";

    const blocks = (blocksByDay && blocksByDay[day]) || [];

    if (blocks.length === 0) {
      const off = document.createElement("div");
      off.className = "day-off";
      off.textContent = "Livre";
      col.appendChild(off);
    } else {
      blocks.forEach(block => {
        const el = document.createElement("div");
        el.className = "block type-" + block.block_type;
        el.style.top = topPx(block.start_time) + "px";
        el.style.height = heightPx(block.start_time, block.end_time) + "px";

        const time = document.createElement("span");
        time.className = "block-time";
        time.textContent = block.start_time.slice(0, 5) + "–" + block.end_time.slice(0, 5);

        el.appendChild(time);
        el.appendChild(document.createTextNode(block.title));
        col.appendChild(el);
      });
    }

    if (day === todayDay && nowMinutes >= BOARD_START_HOUR * 60 && nowMinutes <= BOARD_END_HOUR * 60) {
      const nowLine = document.createElement("div");
      nowLine.className = "now-line";
      nowLine.style.top = ((nowMinutes - BOARD_START_HOUR * 60) / 60) * HOUR_PX + "px";
      col.appendChild(nowLine);
    }

    grid.appendChild(col);
  });

  wrapper.appendChild(grid);
  return wrapper;
}
