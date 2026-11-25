import { NavLink } from 'react-router';
import { Clock } from 'lucide-react';
import { DISPENSARY_TIMETABLE, ROLE_LABELS, type Role } from '@shared/constants';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getDispensaryStatus } from './dispensary-hours';
import { Logo } from './Logo';
import { NAV } from './nav';
import { useNavBadges } from './use-nav-badges';

export function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const badges = useNavBadges(role);
  const status = getDispensaryStatus();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>
      <div className="px-5 pb-2">
        <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold tracking-wide text-sidebar-muted uppercase ring-1 ring-white/[0.06] ring-inset">
          {ROLE_LABELS[role]} workspace
        </span>
      </div>

      <nav className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        {NAV[role].map((section, si) => (
          <div key={si} className="space-y-1">
            {section.label && (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-sidebar-muted/80 uppercase">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const count = item.badge ? badges[item.badge] : undefined;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                      isActive
                        ? 'bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]'
                        : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white',
                      item.danger && !isActive && 'text-rose-300/90 hover:text-rose-200',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-sidebar-primary" aria-hidden />
                      )}
                      <item.icon
                        className={cn(
                          'size-[18px] shrink-0',
                          isActive ? 'text-sidebar-primary' : item.danger ? 'text-rose-300/90' : 'text-sidebar-muted group-hover:text-white',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                      {count ? (
                        <span
                          className={cn(
                            'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                            item.badge === 'activeEmergencies' ? 'bg-rose-500 text-white' : 'bg-sidebar-primary text-sidebar-primary-foreground',
                          )}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 p-3">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full rounded-xl border border-sidebar-border bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.07]"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  {status.open && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                  <span className={cn('relative inline-flex size-2 rounded-full', status.open ? 'bg-emerald-400' : 'bg-slate-500')} />
                </span>
                <span className="text-[13px] font-semibold text-white">{status.open ? 'Dispensary open' : 'Dispensary closed'}</span>
                <Clock className="ml-auto size-3.5 text-sidebar-muted" />
              </div>
              <p className="mt-1 pl-4 text-xs text-sidebar-muted">{status.label}</p>
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-80 p-0">
            <div className="border-b px-4 py-3">
              <p className="font-display text-sm font-semibold">Health centre timings</p>
              <p className="text-xs text-muted-foreground">Closed on gazetted holidays</p>
            </div>
            <ul className="divide-y">
              {DISPENSARY_TIMETABLE.map((row) => (
                <li key={row.days} className="px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-500">{row.days}</p>
                  <p className="text-sm font-medium text-slate-900">{row.hours}</p>
                  {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-sidebar-border lg:block">
      <SidebarContent role={role} />
    </aside>
  );
}
