import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation, type RouteObject } from 'react-router';
import type { Role } from '@shared/constants';
import { AppShell } from '@/components/layout/AppShell';
import { LogoMark } from '@/components/layout/Logo';
import { useAuthState } from '@/hooks/use-auth';

/** Lazy page loader (code-split per page). */
const page = (loader: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await loader()).default }),
});

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <LogoMark className="size-12 animate-pulse" />
      <p className="text-sm text-muted-foreground">Loading Smart Dispensary…</p>
    </div>
  );
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { status, user } = useAuthState();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { status, user } = useAuthState();
  if (status === 'loading') return <FullScreenLoader />;
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

const common: RouteObject[] = [
  { path: 'notifications', ...page(() => import('@/features/notifications/NotificationsPage')) },
  { path: 'profile', ...page(() => import('@/features/profile/ProfilePage')) },
];

const shell = (role: Role, children: RouteObject[]): RouteObject => ({
  path: `/${role}`,
  element: (
    <RequireRole role={role}>
      <AppShell />
    </RequireRole>
  ),
  children: [...children, ...common, { path: '*', ...page(() => import('@/features/misc/NotFoundPage')) }],
});

const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', ...page(() => import('@/features/auth/LoginPage')) },
  shell('student', [
    { index: true, ...page(() => import('@/features/student/StudentDashboardPage')) },
    { path: 'doctors', ...page(() => import('@/features/doctors/DoctorDirectoryPage')) },
    { path: 'doctors/:id', ...page(() => import('@/features/doctors/DoctorProfilePage')) },
    { path: 'book', ...page(() => import('@/features/appointments/BookAppointmentPage')) },
    { path: 'appointments', ...page(() => import('@/features/appointments/StudentAppointmentsPage')) },
    { path: 'prescriptions', ...page(() => import('@/features/prescriptions/StudentPrescriptionsPage')) },
    { path: 'records', ...page(() => import('@/features/records/MedicalRecordsPage')) },
    { path: 'medicines', ...page(() => import('@/features/medicines/MedicineCatalogPage')) },
    { path: 'requests', ...page(() => import('@/features/medicines/MyRequestsPage')) },
    { path: 'emergency', ...page(() => import('@/features/emergency/StudentEmergencyPage')) },
    { path: 'messages', ...page(() => import('@/features/chat/MessagesPage')) },
  ]),
  shell('doctor', [
    { index: true, ...page(() => import('@/features/doctor/DoctorDashboardPage')) },
    { path: 'appointments', ...page(() => import('@/features/doctor/DoctorAppointmentsPage')) },
    { path: 'consultation/:appointmentId', ...page(() => import('@/features/consultation/ConsultationPage')) },
    { path: 'patients', ...page(() => import('@/features/doctor/PatientsPage')) },
    { path: 'patients/:id', ...page(() => import('@/features/doctor/PatientDetailPage')) },
    { path: 'prescriptions', ...page(() => import('@/features/doctor/DoctorPrescriptionsPage')) },
    { path: 'availability', ...page(() => import('@/features/doctor/AvailabilityPage')) },
    { path: 'messages', ...page(() => import('@/features/chat/MessagesPage')) },
    { path: 'emergencies', ...page(() => import('@/features/emergency/EmergencyManagementPage')) },
  ]),
  shell('staff', [
    { index: true, ...page(() => import('@/features/staff/StaffDashboardPage')) },
    { path: 'requests', ...page(() => import('@/features/staff/RequestsManagementPage')) },
    { path: 'inventory', ...page(() => import('@/features/inventory/InventoryPage')) },
    { path: 'emergencies', ...page(() => import('@/features/emergency/EmergencyManagementPage')) },
  ]),
  shell('admin', [
    { index: true, ...page(() => import('@/features/admin/AdminDashboardPage')) },
    { path: 'users', ...page(() => import('@/features/admin/UsersPage')) },
    { path: 'appointments', ...page(() => import('@/features/admin/AdminAppointmentsPage')) },
    { path: 'requests', ...page(() => import('@/features/staff/RequestsManagementPage')) },
    { path: 'inventory', ...page(() => import('@/features/inventory/InventoryPage')) },
    { path: 'emergencies', ...page(() => import('@/features/emergency/EmergencyManagementPage')) },
    { path: 'activity', ...page(() => import('@/features/admin/ActivityLogPage')) },
  ]),
  { path: '*', element: <RootRedirect /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
