import type { Meta, StoryObj } from '@storybook/react'
import LoginPage from './index'

const meta: Meta<typeof LoginPage> = {
  title: 'Pages/Auth/Login',
  component: LoginPage,
}
export default meta

type Story = StoryObj<typeof LoginPage>

export const Default: Story = {
  args: {},
}

export const DomainNotAllowed: Story = {
  args: { error: 'domain_not_allowed' },
}

export const ServiceUnavailable: Story = {
  args: { error: 'auth_service_unavailable' },
}
