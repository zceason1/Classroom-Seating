import {
  COLS,
  DEFAULT_STUDENTS,
  EXAMPLE_STUDENTS,
  assignStudents,
  buildBackupFilename,
  buildSeatCountText,
  chooseFileDelivery,
  countAssignedStudents,
  createEmptyClassroom,
  cycleSeatState,
  getAvailableSeats,
  isSeatAvailable,
  isSeatStateEditable,
  isStructuralUnavailable,
  normalizeClassroom,
  parseStudentNames,
} from './core.js';

const STORAGE_KEY = 'classroom-seating.state.v1';
const HISTORY_LIMIT = 30;

const elements = {
  actionPanels: document.querySelector('#actionPanels'),
  addRowBtn: document.querySelector('#addRowBtn'),
  backupBtn: document.querySelector('#backupBtn'),
  exampleBtn: document.querySelector('#exampleBtn'),
  firstUseNotice: document.querySelector('#firstUseNotice'),
  imageBtn: document.querySelector('#imageBtn'),
  importBtn: document.querySelector('#importBtn'),
  modeLabel: document.querySelector('#modeLabel'),
  modeToggle: document.querySelector('#modeToggle'),
  redoBtn: document.querySelector('#redoBtn'),
  removeRowBtn: document.querySelector('#removeRowBtn'),
  resetBtn: document.querySelector('#resetBtn'),
  restoreBtn: document.querySelector('#restoreBtn'),
  restoreFileInput: document.querySelector('#restoreFileInput'),
  rotateColsBackwardBtn: document.querySelector('#rotateColsBackwardBtn'),
  rotateColsForwardBtn: document.querySelector('#rotateColsForwardBtn'),
  rotateRowsBackwardBtn: document.querySelector('#rotateRowsBackwardBtn'),
  rotateRowsForwardBtn: document.querySelector('#rotateRowsForwardBtn'),
  seatingGrid: document.querySelector('#seatingGrid'),
  seatCountLabel: document.querySelector('#seatCountLabel'),
  selectedInfo: document.querySelector('#selectedInfo'),
  swapCol9Btn: document.querySelector('#swapCol9Btn'),
  toastContainer: document.querySelector('#toastContainer'),
  undoBtn: document.querySelector('#undoBtn'),
};

let classroom = loadClassroom();
let editMode = true;
let selectedCell = null;
let draggedCell = null;
let historyStack = [];
let historyIndex = -1;

function loadClassroom() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return assignStudents(createEmptyClassroom(), DEFAULT_STUDENTS, { keepOrder: true });
    return normalizeClassroom(JSON.parse(saved));
  } catch {
    return createEmptyClassroom();
  }
}

function persistClassroom() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(classroom));
}

function cloneClassroom(value = classroom) {
  return normalizeClassroom(JSON.parse(JSON.stringify(value)));
}

function restoreState(state) {
  classroom = cloneClassroom(state);
  renderAll();
  persistClassroom();
}

function pushHistory() {
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(cloneClassroom());
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  historyIndex = historyStack.length - 1;
  persistClassroom();
  updateUndoRedoButtons();
}

function resetHistory() {
  historyStack = [cloneClassroom()];
  historyIndex = 0;
  updateUndoRedoButtons();
  persistClassroom();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  selectedCell = null;
  restoreState(historyStack[historyIndex]);
  showToast('已撤销');
}

function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex += 1;
  selectedCell = null;
  restoreState(historyStack[historyIndex]);
  showToast('已重做');
}

function updateUndoRedoButtons() {
  elements.undoBtn.disabled = historyIndex <= 0;
  elements.redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

function seatName(row, col) {
  return classroom.seatingData[row]?.[col] || null;
}

function setSeatName(row, col, value) {
  classroom.seatingData[row][col] = value && value.trim() ? value.trim() : null;
}

function clearSelection() {
  selectedCell = null;
}

function escapeHTML(value) {
  const element = document.createElement('div');
  element.textContent = value || '';
  return element.innerHTML;
}

function renderAll() {
  elements.seatingGrid.innerHTML = '';
  elements.seatingGrid.style.setProperty('--rows', String(classroom.totalRows));
  const corner = document.createElement('div');
  corner.className = 'grid-label col-label';
  elements.seatingGrid.appendChild(corner);

  for (let col = 0; col < COLS; col += 1) {
    const label = document.createElement('div');
    label.className = 'grid-label col-label';
    if ([1, 3, 5].includes(col)) label.classList.add('aisle-right-label');
    if (col === COLS - 1) label.classList.add('col-9-label');
    label.textContent = col === COLS - 1 ? '第9列' : `第${col + 1}列`;
    label.style.gridColumn = `${col + 2}`;
    elements.seatingGrid.appendChild(label);
  }

  for (let row = 0; row < classroom.totalRows; row += 1) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-label row-label';
    rowLabel.textContent = `第${row + 1}排`;
    rowLabel.style.gridRow = `${row + 2}`;
    elements.seatingGrid.appendChild(rowLabel);

    for (let col = 0; col < COLS; col += 1) {
      elements.seatingGrid.appendChild(renderSeat(row, col));
    }
  }

  updateUIState();
}

function renderSeat(row, col) {
  const cell = document.createElement('button');
  const state = classroom.seatStates[row]?.[col] || 'normal';
  const available = isSeatAvailable(classroom.seatStates, row, col);
  const stateEditable = isSeatStateEditable(classroom.seatStates, row, col);
  const name = seatName(row, col) || '';
  cell.type = 'button';
  cell.className = 'seat-cell';
  cell.dataset.row = row;
  cell.dataset.col = col;
  cell.style.gridRow = `${row + 2}`;
  cell.style.gridColumn = `${col + 2}`;
  cell.title = `${row + 1}排${col + 1}列：${name || '空位'}`;
  if ([1, 3, 5].includes(col)) cell.classList.add('aisle-right');

  if (!stateEditable) {
    cell.classList.add('seat-disabled');
    cell.classList.add('seat-fixed');
    cell.disabled = true;
    cell.title = '固定不可用座位';
    return cell;
  }

  if (state === 'disabled') {
    cell.classList.add('seat-disabled');
    cell.setAttribute('aria-label', `${row + 1}排${col + 1}列：禁用，按住 Ctrl 或 Command 点击可恢复`);
    cell.innerHTML = `<span class="seat-number">${row + 1}-${col + 1}</span>`;
    cell.title = `${row + 1}排${col + 1}列：禁用。按住 Ctrl 或 Command 点击可恢复`;
  } else if (state === 'locked') {
    cell.classList.add('seat-locked');
    cell.innerHTML = `<span class="lock-icon">锁</span><span class="student-name">${escapeHTML(name)}</span>`;
    cell.title += '（锁定）';
  } else {
    if (col === COLS - 1) cell.classList.add('col-9-seat');
    cell.innerHTML = `<span class="seat-number">${row + 1}-${col + 1}</span><span class="student-name">${escapeHTML(name)}</span>`;
  }

  cell.draggable = editMode;
  cell.addEventListener('click', handleCellClick);
  cell.addEventListener('dblclick', handleCellDoubleClick);
  cell.addEventListener('dragstart', handleDragStart);
  cell.addEventListener('dragover', handleDragOver);
  cell.addEventListener('dragleave', handleDragLeave);
  cell.addEventListener('drop', handleDrop);
  cell.addEventListener('dragend', handleDragEnd);
  return cell;
}

function updateUIState() {
  document.querySelectorAll('.seat-cell').forEach((cell) => {
    const row = Number.parseInt(cell.dataset.row, 10);
    const col = Number.parseInt(cell.dataset.col, 10);
    cell.classList.toggle('selected', Boolean(selectedCell && selectedCell.row === row && selectedCell.col === col));
    if (!cell.disabled) cell.draggable = editMode;
  });

  const assignedCount = countAssignedStudents(classroom);
  elements.firstUseNotice.hidden = assignedCount > 0;
  elements.modeToggle.classList.toggle('active', editMode);
  elements.modeLabel.textContent = editMode ? '编辑模式' : '查看模式';
  elements.actionPanels.classList.toggle('readonly', !editMode);
  elements.seatCountLabel.textContent = buildSeatCountText(classroom);

  if (selectedCell && editMode) {
    const name = seatName(selectedCell.row, selectedCell.col) || '空位';
    elements.selectedInfo.innerHTML = `<span class="dot dot-selected"></span> 已选中：<strong>${escapeHTML(name)}</strong>（${selectedCell.row + 1}排${selectedCell.col + 1}列）`;
  } else {
    elements.selectedInfo.textContent = '未选中';
  }
}

function handleDragStart(event) {
  if (!editMode) {
    event.preventDefault();
    return;
  }
  const row = Number.parseInt(this.dataset.row, 10);
  const col = Number.parseInt(this.dataset.col, 10);
  if (classroom.seatStates[row]?.[col] === 'locked') {
    event.preventDefault();
    showToast('锁定座位不可拖拽');
    return;
  }
  draggedCell = { row, col };
  this.classList.add('dragging');
  event.dataTransfer.setData('text/plain', `${row},${col}`);
}

function handleDragOver(event) {
  if (!editMode) return;
  event.preventDefault();
  this.classList.add('drag-over');
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  this.classList.remove('drag-over');
  if (!editMode || !draggedCell) return;
  const row = Number.parseInt(this.dataset.row, 10);
  const col = Number.parseInt(this.dataset.col, 10);
  if (draggedCell.row === row && draggedCell.col === col) return;
  if (swapStudents(draggedCell.row, draggedCell.col, row, col)) {
    pushHistory();
    renderAll();
    showToast('交换成功');
  }
}

function handleDragEnd() {
  this.classList.remove('dragging');
  draggedCell = null;
}

function handleCellClick(event) {
  if (!editMode) return;
  const row = Number.parseInt(this.dataset.row, 10);
  const col = Number.parseInt(this.dataset.col, 10);

  if (isStructuralUnavailable(row, col)) return;

  if (event.ctrlKey || event.metaKey) {
    const nextState = cycleSeatState(classroom.seatStates[row][col]);
    classroom.seatStates[row][col] = nextState;
    if (nextState === 'disabled') setSeatName(row, col, null);
    selectedCell = null;
    pushHistory();
    renderAll();
    showToast('座位状态已更新');
    return;
  }

  if (classroom.seatStates[row]?.[col] === 'disabled') {
    showToast('禁用座位需按住 Ctrl 或 Command 点击恢复');
    return;
  }

  if (!selectedCell) {
    selectedCell = { row, col };
    updateUIState();
    return;
  }

  if (selectedCell.row === row && selectedCell.col === col) {
    clearSelection();
    updateUIState();
    return;
  }

  if (swapStudents(selectedCell.row, selectedCell.col, row, col)) {
    clearSelection();
    pushHistory();
    renderAll();
    showToast('交换成功');
  }
}

function handleCellDoubleClick() {
  if (!editMode) return;
  const row = Number.parseInt(this.dataset.row, 10);
  const col = Number.parseInt(this.dataset.col, 10);
  if (classroom.seatStates[row]?.[col] !== 'normal') return;
  const updated = window.prompt(`修改姓名（${row + 1}排${col + 1}列）：`, seatName(row, col) || '');
  if (updated === null) return;
  setSeatName(row, col, updated);
  pushHistory();
  renderAll();
  showToast('姓名已更新');
}

function swapStudents(fromRow, fromCol, toRow, toCol) {
  if (!isSeatAvailable(classroom.seatStates, fromRow, fromCol) || !isSeatAvailable(classroom.seatStates, toRow, toCol)) return false;
  if (classroom.seatStates[fromRow]?.[fromCol] === 'locked' || classroom.seatStates[toRow]?.[toCol] === 'locked') {
    showToast('锁定座位不可交换');
    return false;
  }
  const fromName = seatName(fromRow, fromCol);
  const toName = seatName(toRow, toCol);
  setSeatName(fromRow, fromCol, toName);
  setSeatName(toRow, toCol, fromName);
  return true;
}

function rotateRows(direction) {
  if (!editMode) return;
  const availableRows = Math.min(6, classroom.totalRows);
  if (availableRows < 2) return;
  const groups = [
    [0, 1].filter((row) => row < availableRows),
    [2, 3].filter((row) => row < availableRows),
    [4, 5].filter((row) => row < availableRows),
  ].filter((group) => group.length);
  const snapshots = groups.map((group) => group.flatMap((row) => (
    Array.from({ length: COLS - 1 }, (_, col) => ({ row, col, name: seatName(row, col) }))
  )));
  const offset = direction === 'forward' ? 1 : -1;
  groups.forEach((group, groupIndex) => {
    const source = snapshots[(groupIndex - offset + groups.length) % groups.length];
    group.flatMap((row) => Array.from({ length: COLS - 1 }, (_, col) => ({ row, col }))).forEach((target, index) => {
      setSeatName(target.row, target.col, source[index]?.name || null);
    });
  });
  pushHistory();
  renderAll();
  showToast(direction === 'forward' ? '排轮换完成' : '反向排轮换完成');
}

function rotateCols(direction) {
  if (!editMode) return;
  const groups = [[0, 1], [2, 3], [4, 5], [6, 7]];
  const snapshots = groups.map((cols) => cols.flatMap((col) => (
    Array.from({ length: classroom.totalRows }, (_, row) => ({ row, col, name: seatName(row, col) }))
  )));
  const offset = direction === 'forward' ? 1 : -1;
  groups.forEach((cols, groupIndex) => {
    const source = snapshots[(groupIndex - offset + groups.length) % groups.length];
    cols.flatMap((col) => Array.from({ length: classroom.totalRows }, (_, row) => ({ row, col }))).forEach((target, index) => {
      setSeatName(target.row, target.col, source[index]?.name || null);
    });
  });
  pushHistory();
  renderAll();
  showToast(direction === 'forward' ? '列轮换完成' : '反向列轮换完成');
}

function swapCol9Students() {
  if (!editMode || classroom.totalRows < 4) return;
  if (swapStudents(2, COLS - 1, 3, COLS - 1)) {
    pushHistory();
    renderAll();
    showToast('第9列2人互换');
  }
}

function addRow() {
  const newRow = classroom.totalRows;
  classroom.totalRows += 1;
  classroom.seatingData.push(Array(COLS).fill(null));
  classroom.seatStates.push(Array(COLS).fill('normal'));
  if (newRow !== 2 && newRow !== 3) classroom.seatStates[newRow][COLS - 1] = 'disabled';
  pushHistory();
  renderAll();
  showToast(`已增加第${classroom.totalRows}排`);
}

function removeLastRow() {
  if (classroom.totalRows <= 1) {
    showToast('至少保留一排');
    return;
  }
  const lastRow = classroom.totalRows - 1;
  const hasStudent = classroom.seatingData[lastRow].some(Boolean);
  if (hasStudent && !window.confirm(`最后一排有学生，确定删除第${lastRow + 1}排吗？`)) return;
  classroom.totalRows -= 1;
  classroom.seatingData.pop();
  classroom.seatStates.pop();
  pushHistory();
  renderAll();
  showToast('已删除最后一排');
}

function openImportDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="importTitle">
      <h2 id="importTitle">导入学生名单</h2>
      <p>粘贴姓名，支持换行、逗号、空格分隔。页面只保存在当前设备本地。</p>
      <textarea id="importTextarea" placeholder="例如：张三&#10;李四&#10;王五"></textarea>
      <div class="modal-actions">
        <button class="btn" id="fillExample" type="button">填入虚拟示例</button>
        <button class="btn" id="cancelImport" type="button">取消</button>
        <button class="btn" id="importKeepOrder" type="button">按顺序填入</button>
        <button class="btn primary" id="importShuffle" type="button">随机分配</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const textarea = overlay.querySelector('#importTextarea');
  textarea.focus();

  overlay.querySelector('#cancelImport').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#fillExample').addEventListener('click', () => {
    textarea.value = EXAMPLE_STUDENTS.join('\n');
  });
  overlay.querySelector('#importKeepOrder').addEventListener('click', () => importNamesFromTextarea(textarea, overlay, true));
  overlay.querySelector('#importShuffle').addEventListener('click', () => importNamesFromTextarea(textarea, overlay, false));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
}

function importNamesFromTextarea(textarea, overlay, keepOrder) {
  const names = parseStudentNames(textarea.value);
  if (!names.length) {
    showToast('未识别到姓名');
    return;
  }
  classroom = assignStudents(classroom, names, { keepOrder });
  selectedCell = null;
  overlay.remove();
  resetHistory();
  renderAll();
  showToast(`已导入${names.length}个姓名`);
}

function fillExampleNames() {
  classroom = assignStudents(createEmptyClassroom(), EXAMPLE_STUDENTS, { keepOrder: true });
  selectedCell = null;
  resetHistory();
  renderAll();
  showToast('已填入虚拟示例名单');
}

async function downloadBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const canDownload = Boolean(window.URL && window.URL.createObjectURL && 'download' in document.createElement('a'));
  const canShareFiles = Boolean(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  const delivery = chooseFileDelivery({ canDownload, canShareFiles });

  if (delivery === 'download') {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  if (delivery === 'share') {
    await navigator.share({ files: [file], title: filename });
    return;
  }

  throw new Error('file export unsupported');
}

async function exportBackup() {
  const blob = new Blob([JSON.stringify(classroom, null, 2)], { type: 'application/json' });
  await downloadBlob(blob, buildBackupFilename());
  showToast('备份文件已生成');
}

async function exportImage() {
  if (!window.html2canvas) {
    showToast('图片组件未加载，请刷新后重试');
    return;
  }
  try {
    const target = document.querySelector('#exportArea');
    const canvas = await window.html2canvas(target, { backgroundColor: '#ffffff', scale: 2 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    await downloadBlob(blob, `座位表-${buildBackupFilename().replace('_座位表备份.json', '')}.png`);
    showToast('座位表图片已生成');
  } catch {
    showToast('图片生成失败，请稍后重试');
  }
}

function restoreBackupFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      classroom = normalizeClassroom(JSON.parse(reader.result));
      selectedCell = null;
      resetHistory();
      renderAll();
      showToast('备份已恢复');
    } catch {
      showToast('备份文件无法读取');
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!window.confirm('确定清空当前座位表？此操作只清空本机保存的数据。')) return;
  classroom = assignStudents(createEmptyClassroom(), DEFAULT_STUDENTS, { keepOrder: true });
  selectedCell = null;
  resetHistory();
  renderAll();
  showToast('已重置，请重新导入名单');
}

function toggleEditMode() {
  editMode = !editMode;
  selectedCell = null;
  renderAll();
  showToast(editMode ? '编辑模式' : '查看模式');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function bindEvents() {
  elements.addRowBtn.addEventListener('click', addRow);
  elements.backupBtn.addEventListener('click', exportBackup);
  elements.exampleBtn.addEventListener('click', fillExampleNames);
  elements.imageBtn.addEventListener('click', exportImage);
  elements.importBtn.addEventListener('click', openImportDialog);
  elements.modeToggle.addEventListener('click', toggleEditMode);
  elements.redoBtn.addEventListener('click', redo);
  elements.removeRowBtn.addEventListener('click', removeLastRow);
  elements.resetBtn.addEventListener('click', resetAll);
  elements.restoreBtn.addEventListener('click', () => elements.restoreFileInput.click());
  elements.restoreFileInput.addEventListener('change', (event) => {
    restoreBackupFromFile(event.target.files?.[0]);
    event.target.value = '';
  });
  elements.rotateColsBackwardBtn.addEventListener('click', () => rotateCols('backward'));
  elements.rotateColsForwardBtn.addEventListener('click', () => rotateCols('forward'));
  elements.rotateRowsBackwardBtn.addEventListener('click', () => rotateRows('backward'));
  elements.rotateRowsForwardBtn.addEventListener('click', () => rotateRows('forward'));
  elements.swapCol9Btn.addEventListener('click', swapCol9Students);
  elements.undoBtn.addEventListener('click', undo);

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    }
    if (event.key === 'Escape') {
      selectedCell = null;
      updateUIState();
    }
  });

  document.addEventListener('click', (event) => {
    if (selectedCell && !event.target.closest('.seat-cell') && !event.target.closest('.modal')) {
      selectedCell = null;
      updateUIState();
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      showToast('离线缓存未启用');
    });
  });
}

bindEvents();
resetHistory();
renderAll();
registerServiceWorker();
