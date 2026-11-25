import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CalendarPlus, PillBottle, Search, Siren, UserRound } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAuth } from '@/hooks/use-auth';
import { flatNav } from './nav';

/** ⌘K / Ctrl+K quick navigation. */
export function CommandMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const quick =
    user.role === 'student'
      ? [
          { label: 'Book an appointment', to: '/student/book', icon: CalendarPlus },
          { label: 'Request medicines', to: '/student/medicines', icon: PillBottle },
          { label: 'Request emergency assistance', to: '/student/emergency', icon: Siren },
        ]
      : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white md:flex"
      >
        <Search className="size-4" />
        <span>Search or jump to…</span>
        <kbd className="ml-auto rounded border bg-white px-1.5 font-sans text-[10px] font-semibold text-slate-500">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Quick navigation" description="Jump to any page">
        <CommandInput placeholder="Where do you want to go?" />
        <CommandList>
          <CommandEmpty>No matching pages.</CommandEmpty>
          {quick.length > 0 && (
            <>
              <CommandGroup heading="Quick actions">
                {quick.map((q) => (
                  <CommandItem key={q.to} value={q.label} onSelect={() => go(q.to)}>
                    <q.icon /> {q.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Pages">
            {flatNav(user.role).map((item) => (
              <CommandItem key={item.to} value={`${item.label} ${item.keywords ?? ''}`} onSelect={() => go(item.to)}>
                <item.icon /> {item.label}
              </CommandItem>
            ))}
            <CommandItem value="notifications alerts" onSelect={() => go(`/${user.role}/notifications`)}>
              <Bell /> Notifications
            </CommandItem>
            <CommandItem value="profile account settings" onSelect={() => go(`/${user.role}/profile`)}>
              <UserRound /> My profile
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
