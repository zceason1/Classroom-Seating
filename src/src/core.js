export const COLS = 9;
export const INITIAL_ROWS = 6;
export const COL9_AVAILABLE_ROWS = [2, 3];
export const DEFAULT_STUDENTS = [];
export const EXAMPLE_STUDENTS = [
  '张三',
  '李四',
  '王五',
  '赵六',
  '钱七',
  '孙八',
  '周九',
  '吴十',
  '郑十一',
  '王十二',
];

export function parseStudentNames(raw) {
  if (!raw) return [];
  const names = String(raw)
    .split(/[\n,，、;；\s\t]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

export function createSeatStates(totalRows = INITIAL_ROWS) {
  return Array.from({ length: totalRows }, (_, rowIndex) => {
    const row = Array(COLS).fill('normal');
    if (!COL9_AVAILABLE_ROWS.includes(rowIndex)) row[COLS - 1] = 'disabled';
    return row;
  });
}

export function createEmptyClassroom(totalRows = INITIAL_ROWS) {
  return {
    totalRows,
    seatingData: Array.from({ length: totalRows }, () => Array(COLS).fill(null)),
    seatStates: createSeatStates(totalRows),
  };
}

export function normalizeClassroom(input) {
  if (!input || typeof input !== 'object') return createEmptyClassroom();
  const totalRows = Math.max(1, Number.parseInt(input.totalRows || input.rows || INITIAL_ROWS, 10));
  const defaults = createEmptyClassroom(totalRows);

  return {
    totalRows,
    seatingData: Array.from({ length: totalRows }, (_, rowIndex) => (
      Array.from({ length: COLS }, (_, colIndex) => {
        const value = input.seatingData?.[rowIndex]?.[colIndex] ?? input.data?.[rowIndex]?.[colIndex] ?? null;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      })
    )),
    seatStates: Array.from({ length: totalRows }, (_, rowIndex) => (
      Array.from({ length: COLS }, (_, colIndex) => {
        if (colIndex === COLS - 1 && !COL9_AVAILABLE_ROWS.includes(rowIndex)) return 'disabled';
        const state = input.seatStates?.[rowIndex]?.[colIndex] ?? input.states?.[rowIndex]?.[colIndex] ?? defaults.seatStates[rowIndex][colIndex];
        return ['normal', 'locked', 'disabled'].includes(state) ? state : 'normal';
      })
    )),
  };
}

export function isSeatAvailable(seatStates, row, col) {
  if (col < 0 || col >= COLS || row < 0 || row >= seatStates.length) return false;
  if (col === COLS - 1 && !COL9_AVAILABLE_ROWS.includes(row)) return false;
  return seatStates[row]?.[col] !== 'disabled';
}

export function getAvailableSeats(seatStates) {
  const seats = [];
  for (let row = 0; row < seatStates.length; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (isSeatAvailable(seatStates, row, col)) seats.push({ row, col });
    }
  }
  return seats;
}

export function shuffleArray(values, rng = Math.random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function assignStudents(classroom, names, options = {}) {
  const normalized = normalizeClassroom(classroom);
  const students = Array.isArray(names) ? parseStudentNames(names.join('\n')) : parseStudentNames(names);
  const orderedStudents = options.keepOrder ? students : shuffleArray(students, options.rng);
  const seatingData = Array.from({ length: normalized.totalRows }, () => Array(COLS).fill(null));
  const availableSeats = getAvailableSeats(normalized.seatStates);

  availableSeats.forEach(({ row, col }, index) => {
    seatingData[row][col] = orderedStudents[index] || null;
  });

  return {
    ...normalized,
    seatingData,
  };
}

export function cycleSeatState(currentState) {
  if (currentState === 'normal') return 'locked';
  if (currentState === 'locked') return 'disabled';
  return 'normal';
}

export function countAssignedStudents(classroom) {
  return normalizeClassroom(classroom).seatingData.flat().filter(Boolean).length;
}

export function buildSeatCountText(classroom) {
  const normalized = normalizeClassroom(classroom);
  return `${normalized.totalRows}排×${COLS}列 · ${getAvailableSeats(normalized.seatStates).length}座`;
}

export function buildBackupFilename(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}_座位表备份.json`;
}

export function chooseFileDelivery({ canDownload, canShareFiles }) {
  if (canDownload) return 'download';
  if (canShareFiles) return 'share';
  return 'unsupported';
}
