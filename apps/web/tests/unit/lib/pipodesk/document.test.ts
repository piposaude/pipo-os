// @vitest-environment node
import {
  documentKey,
  documentLabel,
  documentTitle,
  downloadName,
  versionsByKind,
} from '@/lib/pipodesk/document'

describe('documentLabel', () => {
  it('should name the documents the EI asks for, in both spellings of the proof of address', () => {
    expect(documentLabel('rg')).toBe('RG')
    expect(documentLabel('cpf')).toBe('CPF')
    expect(documentLabel('comprovante-residencia')).toBe('Comprovante de residência')
    expect(documentLabel('comprovante_residencia')).toBe('Comprovante de residência')
  })

  it('should capitalise an unknown key instead of hiding it', () => {
    expect(documentLabel('certidao')).toBe('Certidao')
  })
})

describe('documentKey', () => {
  /** The pendency key and the file's kind are two EI spellings of the same
   *  document — and they differ by a word, not only by separator and accent.
   *  Matching them through the label let copy steer the comparison. */
  it('should resolve every EI spelling to the one key that names the document', () => {
    expect(documentKey('comprovante-residencia')).toBe('comprovante-residencia')
    expect(documentKey('comprovante_residencia')).toBe('comprovante-residencia')
    expect(documentKey('Comprovante de residência')).toBe('comprovante-residencia')
    expect(documentKey('rg')).toBe('rg')
    expect(documentKey('RG')).toBe('rg')
  })

  it('should keep documents that are not the same apart', () => {
    expect(documentKey('rg')).not.toBe(documentKey('CPF'))
  })

  it('should give an unknown spelling a key of its own, never a label', () => {
    expect(documentKey('Certidão de nascimento')).toBe('certidaodenascimento')
  })
})

describe('documentTitle', () => {
  it('should name the document by kind, person and ticket', () => {
    expect(documentTitle({ kind: 'RG' }, '700123', 'Ana Souza')).toBe('RG · Ana Souza · 700123')
  })

  it('should fall back to kind and ticket when the ticket moves nobody', () => {
    expect(documentTitle({ kind: 'RG' }, '700123', null)).toBe('RG · 700123')
  })
})

describe('downloadName', () => {
  it('should lead with the ticket, so a downloads folder sorts by case', () => {
    expect(downloadName({ name: 'RG.pdf', kind: 'RG' }, '700123', 'Ana Souza')).toBe(
      '700123-ana-souza-rg.pdf',
    )
  })

  it('should strip accents and punctuation, which a carrier portal may reject', () => {
    expect(downloadName({ name: 'ficha.PDF', kind: 'Ficha de adesão' }, '70', 'Íris D`Ávila')).toBe(
      '70-iris-d-avila-ficha-de-adesao.PDF',
    )
  })

  it('should keep the name usable when the original has no extension', () => {
    expect(downloadName({ name: 'RG', kind: 'RG' }, '700123', null)).toBe('700123-rg')
  })
})

describe('versionsByKind', () => {
  const doc = (id: string, kind: string, at: string) => ({ id, kind, at })

  it('should group by kind, newest version first', () => {
    const groups = versionsByKind([
      doc('d-1', 'RG', '2026-01-10'),
      doc('d-2', 'RG', '2026-03-02'),
      doc('d-3', 'CPF', '2026-02-01'),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['RG', 'CPF'])
    expect(groups[0]?.versions.map((version) => version.id)).toEqual(['d-2', 'd-1'])
  })

  it('should group by kind and not by file name — a photo and a PDF of one RG are two versions', () => {
    const groups = versionsByKind([
      { ...doc('d-1', 'RG', '2026-01-10'), name: 'RG.jpg' },
      { ...doc('d-2', 'RG', '2026-03-02'), name: 'RG.pdf' },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.versions).toHaveLength(2)
  })

  it('should read two EI spellings of one document as versions of it, not as two documents', () => {
    const groups = versionsByKind([
      doc('d-1', 'comprovante-residencia', '2026-01-10'),
      doc('d-2', 'Comprovante de residência', '2026-03-02'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.versions.map((version) => version.id)).toEqual(['d-2', 'd-1'])
  })

  it('should title the group with the spelling of the version that stands', () => {
    // The newest is neither the first nor the last of the input, so reading the
    // wrong one would show.
    const groups = versionsByKind([
      doc('d-1', 'comprovante-residencia', '2026-01-10'),
      doc('d-2', 'Comprovante de residência', '2026-03-02'),
      doc('d-3', 'comprovante_residencia', '2026-02-01'),
    ])

    expect(groups[0]?.kind).toBe('Comprovante de residência')
  })

  it('should break a same-day tie by id, so the order never flickers', () => {
    const groups = versionsByKind([doc('d-1', 'RG', '2026-01-10'), doc('d-2', 'RG', '2026-01-10')])

    expect(groups[0]?.versions.map((version) => version.id)).toEqual(['d-2', 'd-1'])
  })
})
