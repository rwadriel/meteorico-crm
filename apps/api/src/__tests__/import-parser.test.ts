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
    expect(normalizePhone('551199999000099')).toBeNull();
  });

  it('returns null for non-BR prefix', () => {
    expect(normalizePhone('441234567890')).toBeNull();
  });
});

describe('parseContactsCsv', () => {
  it('parses valid CSV', () => {
    const csv = [
      'telefone,nome,email,quantidade_participacoes,ultima_edicao,aluno,produto,origem,primeiro_contato,ultimo_contato,observacoes',
      '11999990001,Ana Teste,ana@test.dev,3,39,sim,Produto X,csv,,,' ,
    ].join('\n');

    const { rows, errors } = parseContactsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('5511999990001');
    expect(rows[0].name).toBe('Ana Teste');
    expect(rows[0].totalParticipations).toBe(3);
    expect(rows[0].lastEdition).toBe(39);
    expect(rows[0].isStudent).toBe(true);
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
    const csv = 'telefone,nome,email,quantidade_participacoes\n11999990002,Teste,,abc';
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
});

describe('parseParticipationsCsv', () => {
  it('parses valid CSV', () => {
    const csv = [
      'telefone,campanha,aluno,status,marcado_saiu,rotulos_vcard,origem',
      '11999990003,39,sim,ativo,nao,label1,csv',
    ].join('\n');

    const { rows, errors } = parseParticipationsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('5511999990003');
    expect(rows[0].campaignNumber).toBe(39);
    expect(rows[0].isCurrentStudent).toBe(true);
    expect(rows[0].markedLeft).toBe(false);
    expect(rows[0].vcardLabels).toBe('label1');
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
