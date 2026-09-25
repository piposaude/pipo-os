import { indexRecords, type RecordSource, type TicketRecords } from '@/lib/pipodesk/record'
import { companiesFixture } from './dataset'
import raw from './records.json'

const data = raw as unknown as Omit<RecordSource, 'companies'>

export const records: TicketRecords = indexRecords({ ...data, companies: companiesFixture })
