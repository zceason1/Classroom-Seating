import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COLS,
  DEFAULT_STUDENTS,
  assignStudents,
  buildBackupFilename,
  createEmptyClassroom,
  getAvailableSeats,
  parseStudentNames,
} from '../src/core.js';

test('default student list is empty so first use requires importing names', () => {
  assert.deepEqual(DEFAULT_STUDENTS, []);
});

test('createEmptyClassroom builds an empty six-row classroom with fifty available seats', () => {
  const classroom = createEmptyClassroom();

  assert.equal(classroom.totalRows, 6);
  assert.equal(classroom.seatingData.flat().filter(Boolean).length, 0);
  assert.equal(classroom.seatStates.every((row) => row.length === COLS), true);
  assert.equal(getAvailableSeats(classroom.seatStates).length, 50);
});

test('parseStudentNames accepts common separators, trims values, and removes duplicates', () => {
  assert.deepEqual(
    parseStudentNames('学生甲\n学生乙，学生甲 学生丙\t学生丁,学生乙'),
    ['学生甲', '学生乙', '学生丙', '学生丁'],
  );
});

test('assignStudents can fill imported names in classroom order without shuffling', () => {
  const classroom = createEmptyClassroom();
  const assigned = assignStudents(classroom, ['学生甲', '学生乙', '学生丙'], { keepOrder: true });

  assert.equal(assigned.seatingData[0][0], '学生甲');
  assert.equal(assigned.seatingData[0][1], '学生乙');
  assert.equal(assigned.seatingData[0][2], '学生丙');
  assert.equal(assigned.seatingData.flat().filter(Boolean).length, 3);
});

test('buildBackupFilename uses a stable timestamp and json extension', () => {
  assert.equal(
    buildBackupFilename(new Date('2026-06-22T10:08:05+08:00')),
    '2026-06-22_10-08-05_座位表备份.json',
  );
});

test('public files do not include a non-empty default student list marker', () => {
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const core = fs.readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');

  assert.doesNotMatch(`${index}\n${app}\n${core}`, /DEFAULT_NAMES\s*=\s*\[[^\]]+\]/);
  assert.match(index, /首次使用请先导入学生名单/);
});
