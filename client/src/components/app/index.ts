/**
 * Shared application components (lead-owned). Signatures:
 *
 * PageHeader({ title, description?, actions?, back?: {to,label}, eyebrow?, className? })
 * Panel({ title?, description?, actions?, icon?, children, className?, bodyClassName?, padded? = true, id? })
 * StatCard({ label, value, icon, hint?, tone? = 'teal', trend?: {value, direction:'up'|'down'|'flat', positive?}, to? })
 * EmptyState({ icon, title, description?, action?, compact? })
 * InfoRow({ label, value, icon? })                KeyValueGrid({ items: {label, value, full?}[], columns? = 2 })
 * StatusBadge({ kind, status, noDot? })            kind: appointment|request|emergency|severity|stock|expiry|consultation|call|user
 * ToneBadge({ tone?, dot?, pulse?, icon?, children })   statusTone(kind, status) / statusLabel(kind, status)
 * UserAvatar({ user: {name, avatarColor}, size? = 'md' (xs|sm|md|lg|xl), online? })
 * SearchInput({ value, onChange, placeholder?, className? })
 * FilterChips({ options: {value,label,count?}[], value, onChange })
 * Field({ label, htmlFor?, error?, hint?, required?, children })
 * TagInput({ value: string[], onChange, suggestions?, placeholder? })
 * ConfirmDialog({ open, onOpenChange, title, description?, confirmLabel?, tone?: 'default'|'danger', onConfirm, loading? })
 * LoadingState({ label? })  ErrorState({ error, retry? })  PageSkeleton({ stats? })  ListSkeleton({ rows? })  Spinner
 * DataTable({ columns: {key, header, cell(row), className?, headClassName?}[], rows, rowKey, onRowClick?, empty?, loading? })
 * Timeline({ events: StatusEvent[], labels? })
 * ProgressSteps({ steps: {key,label}[], current, failed?: {label} | null })
 * QRPass({ value, title, subtitle?, code, details?: {label,value}[], footnote? })
 * Tone colours: TONE_BADGE / TONE_TILE / TONE_DOT / TONE_HEX
 */
export * from './controls';
export * from './data-display';
export * from './feedback';
export * from './layout-blocks';
export * from './status-badge';
export * from './tone';
export * from './user-avatar';
