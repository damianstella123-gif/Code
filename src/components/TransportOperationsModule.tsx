import SimpleTransportOperations from './SimpleTransportOperations'

interface Props {
  eventId: string
  disabled?: boolean
}

export default function TransportOperationsModule({ eventId, disabled }: Props) {
  return <SimpleTransportOperations eventId={eventId} disabled={disabled} />
}
