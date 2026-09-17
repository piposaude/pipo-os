import type { Meta, StoryObj } from '@storybook/react'
import NoAccessPage from './index'

const meta: Meta<typeof NoAccessPage> = {
  title: 'Pages/Auth/NoAccess',
  component: NoAccessPage,
}
export default meta

type Story = StoryObj<typeof NoAccessPage>

export const Default: Story = {
  args: {},
}
