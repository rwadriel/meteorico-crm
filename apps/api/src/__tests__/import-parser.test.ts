import { describe, it, expect } from 'vitest';
import { normalizePhone, parseContactsCsv, parseParticipationsCsv } from '../services/import.js';

describe('normalizePhone', () => {
  it('normalizes 11-digit BR number', () => {
    expect(normalizePhone('11999990000')).toBe('5511999990000');
  });

  it('normalizes 10-digit BR number', () => {
    expect(normalizePhone('1199990000')).toBe('551199990000');
  });

  it('keeps already-prefixed 55 number', () => {
    expect(normalizePhone('5511999990000')).toBe('5511999990000');
  });

  it('handles +55 international format', () => {
    expect(normalizePhone('+5511999990000')).toBe('5511999990000');
  });

  it('strips non-digits', () => {
    expect(normalizePhone('(11) 99999-0000')).toBe('5511999990000');
  });

  it('returns null for too-short number', () => {
    expect(normalizePhone('12345')).toBeNull();
  });

  it('returns null for too-long number', () => {
    expect(normalizePhone('5511999990000999')).toBeNull();
  });

  it('accepts international numbers', () => {
    expect(normalizePhone('441234567890')).toBe('441234567890');
    expect(normalizePhone('351912345678')).toBe('351912345678');
    expect(normalizePhone('244923206134')).toBe('244923206134');
  });
});

// ─── Test 1: Columns in standard order ───────────────────────────────

describe('parseContactsCsv – header-based', () => {
  it('1. parses columns in standard order', () => {
    const csv = [
      'telefone,nome,email,quantidade_participacoes,ultima_edicao,aluno,produto,origem,data_primeiro_contato,data_ultimo_contato,observacoes',
      '11999990001,Ana Teste,ana@test.dev,3,39,sim,Produto X,csv,,,',
    ].join('\n');

    const { rows, errors, headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('5511999990001');
    expect(rows[0].name).toBe('Ana Teste');
    expect(rows[0].email).toBe('ana@test.dev');
    expect(rows[0].totalParticipations).toBe(3);
    expect(rows[0].lastEdition).toBe(39);
    expect(rows[0].isStudent).toBe(true);
  });

  // ─── Test 2: Columns in different order ──────────────────────────

  it('2. parses columns in different order', () => {
    const csv = [
      'nome,telefone,aluno,email,quantidade_participacoes',
      'Carlos Teste,91999990002,nao,carlos@test.dev,2',
    ].join('\n');

    const { rows, errors, headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('5591999990002');
    expect(rows[0].name).toBe('Carlos Teste');
    expect(rows[0].email).toBe('carlos@test.dev');
    expect(rows[0].isStudent).toBe(false);
    expect(rows[0].totalParticipations).toBe(2);
  });

  // ─── Test 3: Required column missing ─────────────────────────────

  it('3. rejects CSV with missing required column (telefone)', () => {
    const csv = 'nome,email,aluno\nAna,ana@test.dev,sim';
    const { headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeDefined();
    expect(headerErrors!.some(e => e.includes('telefone'))).toBe(true);
  });

  // ─── Test 4: Invalid/unrecognized header ─────────────────────────

  it('4. rejects CSV with no recognized headers', () => {
    const csv = 'foo,bar,baz\n1,2,3';
    const { headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeDefined();
    expect(headerErrors!.length).toBeGreaterThan(0);
  });

  // ─── Test 5: Email validated (invalid email) ─────────────────────

  it('5. reports error for invalid email format', () => {
    const csv = 'telefone,email\n11999990010,not-an-email';
    const { rows, errors } = parseContactsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('email');
  });

  // ─── Test 6: Email normalized trim/lowercase ─────────────────────

  it('6. normalizes email to lowercase with trim', () => {
    const csv = 'telefone,email\n11999990011, Ana@Test.Dev ';
    const { rows } = parseContactsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ana@test.dev');
  });

  // ─── Test 7: aluno=sim detection ─────────────────────────────────

  it('7. detects aluno=sim correctly', () => {
    const csv = 'telefone,aluno\n11999990012,sim';
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].isStudent).toBe(true);
  });

  // ─── Test 8: aluno=nao detection ─────────────────────────────────

  it('8. detects aluno=nao correctly', () => {
    const csv = 'telefone,aluno\n11999990013,nao';
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].isStudent).toBe(false);
  });

  // ─── Test 9: Duplicate phone in same CSV ─────────────────────────

  it('9. handles duplicate phone in same CSV (both rows parsed)', () => {
    const csv = [
      'telefone,nome',
      '11999990014,Primeira',
      '11999990014,Segunda',
    ].join('\n');
    const { rows } = parseContactsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].phone).toBe(rows[1].phone);
  });

  it('reports error for missing phone', () => {
    const csv = 'telefone,nome\n,Sem Telefone';
    const { rows, errors } = parseContactsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('telefone');
  });

  it('reports error for invalid phone', () => {
    const csv = 'telefone,nome\n12345,Invalido';
    const { rows, errors } = parseContactsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Invalid');
  });

  it('reports error for non-numeric participations', () => {
    const csv = 'telefone,quantidade_participacoes\n11999990015,abc';
    const { rows, errors } = parseContactsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('quantidade_participacoes');
  });

  it('returns empty for empty content', () => {
    const { rows, errors } = parseContactsCsv('');
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('detects semicolon delimiter', () => {
    const csv = 'telefone;nome;email\n11999990016;Ana;ana@test.dev';
    const { rows, errors, headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ana');
  });

  it('detects tab delimiter', () => {
    const csv = 'telefone\tnome\temail\n11999990017\tBob\tbob@test.dev';
    const { rows, errors, headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Bob');
  });

  it('reports duplicate header', () => {
    const csv = 'telefone,nome,nome\n11999990018,A,B';
    const { headerErrors } = parseContactsCsv(csv);
    expect(headerErrors).toBeDefined();
    expect(headerErrors!.some(e => e.includes('Duplicate'))).toBe(true);
  });

  it('preserves ultima_edicao and quantidade_participacoes for audit', () => {
    const csv = 'telefone,quantidade_participacoes,ultima_edicao\n11999990019,5,42';
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].totalParticipations).toBe(5);
    expect(rows[0].lastEdition).toBe(42);
  });
});

// ─── Participation CSV tests ─────────────────────────────────────────

describe('parseParticipationsCsv – header-based', () => {
  it('parses standard participation CSV', () => {
    const csv = [
      'telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem',
      '11999990003,39,sim,ativo,nao,label1,csv',
    ].join('\n');

    const { rows, errors, headerErrors } = parseParticipationsCsv(csv);
    expect(headerErrors).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('5511999990003');
    expect(rows[0].campaignNumber).toBe(39);
    expect(rows[0].isCurrentStudent).toBe(true);
  });

  it('parses participation CSV in different column order', () => {
    const csv = [
      'campanha,telefone,origem,aluno_atual',
      '40,91999990020,csv,nao',
    ].join('\n');

    const { rows, errors, headerErrors } = parseParticipationsCsv(csv);
    expect(headerErrors).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('5591999990020');
    expect(rows[0].campaignNumber).toBe(40);
  });

  it('rejects participation CSV without campanha header', () => {
    const csv = 'telefone,origem\n11999990021,csv';
    const { headerErrors } = parseParticipationsCsv(csv);
    expect(headerErrors).toBeDefined();
    expect(headerErrors!.some(e => e.includes('campanha'))).toBe(true);
  });

  it('reports error for missing campaign number', () => {
    const csv = 'telefone,campanha\n11999990004,';
    const { rows, errors } = parseParticipationsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('campanha');
  });

  it('reports error for zero campaign number', () => {
    const csv = 'telefone,campanha\n11999990005,0';
    const { rows, errors } = parseParticipationsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('positive');
  });

  // ─── Test 11: Same phone + same campaign twice ───────────────────

  it('11. handles same phone + same campaign in CSV (both rows parsed, dedup at import)', () => {
    const csv = [
      'telefone,campanha',
      '91999990022,40',
      '91999990022,40',
    ].join('\n');
    const { rows } = parseParticipationsCsv(csv);
    expect(rows).toHaveLength(2);
  });

  // ─── Test 12: Same phone + different campaigns ───────────────────

  it('12. handles same phone in different campaigns', () => {
    const csv = [
      'telefone,campanha',
      '91999990023,27',
      '91999990023,39',
      '91999990023,40',
    ].join('\n');
    const { rows } = parseParticipationsCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].campaignNumber).toBe(27);
    expect(rows[1].campaignNumber).toBe(39);
    expect(rows[2].campaignNumber).toBe(40);
  });
});

describe('sanitizeString (via CSV parsing)', () => {
  it('strips CSV formula prefix =', () => {
    const csv = 'telefone,nome\n11999990006,=CMD("calc")';
    const { rows } = parseContactsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).not.toContain('=');
    expect(rows[0].name).toBe('CMD(calc)');
  });

  it('strips CSV formula prefix +', () => {
    const csv = 'telefone,nome\n11999990007,+cmd';
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].name).toBe('cmd');
  });

  it('strips CSV formula prefix -', () => {
    const csv = 'telefone,nome\n11999990008,-cmd';
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].name).toBe('cmd');
  });

  it('strips CSV formula prefix @', () => {
    const csv = 'telefone,nome\n11999990009,@SUM(A1)';
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].name).toBe('SUM(A1)');
  });
});
