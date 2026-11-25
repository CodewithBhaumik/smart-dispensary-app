import { useState } from 'react';
import { Link, Outlet, useNavigate, useNavigation } from 'react-router';
import { Bell, LogOut, Menu, Siren, UserRound } from 'lucide-react';
import { ROLE_LABELS } from '@shared/constants';
import { UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { CallProvider } from '@/features/calls/CallProvider';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { CommandMenu } from './CommandMenu';
import { EmergencyBanner } from './EmergencyBanner';
import { NotificationBell } from './NotificationBell';
import { RealtimeBridge } from './RealtimeBridge';
import { RoleSwitcher } from './RoleSwitcher';
import { Sidebar, SidebarContent } from './Sidebar';

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-muted sm:pr-3"
          aria-label="Account menu"
        >
          <UserAvatar user={user} size="sm" />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block max-w-[160px] truncate text-[13px] font-semibold text-slate-900">{user.name}</span>
            <span className="block max-w-[160px] truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(`/${user.role}/profile`)}>
          <UserRound /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/${user.role}/notifications`)}>
          <Bell /> Notifications
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate('/login');
          }}
          className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RouteProgress() {
  const navigation = useNavigation();
  const loading = navigation.state !== 'idle';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5" aria-hidden>
      <div
        className={cn(
          'h-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500 ease-out',
          loading ? 'w-3/4 opacity-100' : 'w-full opacity-0',
        )}
      />
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <CallProvider>
      <RealtimeBridge />
      <RouteProgress />
      <Sidebar role={user.role} />
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] border-0 p-0 [&>button]:text-white">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          <SidebarContent role={user.role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-dvh flex-col lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <CommandMenu />
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {user.role === 'student' && (
                <Button asChild variant="outline" size="sm" className="hidden border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 sm:inline-flex">
                  <Link to="/student/emergency">
                    <Siren /> Emergency
                  </Link>
                </Button>
              )}
              <RoleSwitcher />
              <NotificationBell />
              <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
              <UserMenu />
            </div>
          </div>
        </header>
        <EmergencyBanner />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </CallProvider>
  );
}
