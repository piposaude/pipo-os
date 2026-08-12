import { render, screen, fireEvent } from '@testing-library/react'
import { TextArea } from '@/components/ui'

describe('TextArea', () => {
  it('should link the label to the textarea and propagate typed changes', () => {
    const handleChange = vi.fn()
    render(<TextArea label="Descrição" value="" onChange={handleChange} />)

    const textarea = screen.getByLabelText('Descrição')
    fireEvent.change(textarea, { target: { value: 'novo texto' } })

    expect(handleChange).toHaveBeenCalledTimes(1)
    expect(textarea).not.toHaveAttribute('aria-invalid')
  })

  it('should show the error message and aria-invalid when error=true', () => {
    render(<TextArea label="Descrição" error errorMessage="Campo obrigatório." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Campo obrigatório.')
    expect(screen.getByLabelText('Descrição')).toHaveAttribute('aria-invalid', 'true')
  })

  it('should show the hint when there is no error', () => {
    render(<TextArea label="Descrição" hint="Máximo de 500 caracteres." />)

    expect(screen.getByText('Máximo de 500 caracteres.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
