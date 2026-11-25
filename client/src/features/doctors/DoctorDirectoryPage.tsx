import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, UserRoundSearch } from 'lucide-react';
import { EmptyState, ErrorState, FilterChips, PageHeader, SearchInput } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useDoctors } from './api';
import { DoctorCard } from './components/DoctorCard';

export default function DoctorDirectoryPage() {
  const { data, isLoading, isError, error, refetch } = useDoctors();
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('all');
  const [availableToday, setAvailableToday] = useState(false);

  const doctors = data ?? [];
  const specialties = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of doctors) counts.set(d.specialty, (counts.get(d.specialty) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [doctors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctors.filter((d) => {
      const matches =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        d.qualifications.toLowerCase().includes(q) ||
        (d.title ?? '').toLowerCase().includes(q);
      const inSpecialty = specialty === 'all' || d.specialty === specialty;
      const today = !availableToday || (d.isAccepting && d.todayFreeSlots > 0);
      return matches && inSpecialty && today;
    });
  }, [doctors, search, specialty, availableToday]);

  const availableCount = doctors.filter((d) => d.isAccepting && d.todayFreeSlots > 0).length;
  const clear = () => {
    setSearch('');
    setSpecialty('all');
    setAvailableToday(false);
  };

  return (
    <>
      <PageHeader
        title="Find a doctor"
        description="Browse the health centre's medical officers and visiting specialists, check OPD timings and book a slot."
        actions={
          <Button asChild>
            <Link to="/student/book">
              <CalendarPlus /> Book appointment
            </Link>
          </Button>
        }
      />

      <div className="mb-5 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search doctors, specialties…" className="sm:w-80" />
          <div className="flex items-center gap-4">
            <p className="hidden text-[13px] text-muted-foreground md:block">
              {isLoading ? 'Loading…' : `${doctors.length} doctors · ${availableCount} available today`}
            </p>
            <div className="flex items-center gap-2">
              <Switch id="available-today" checked={availableToday} onCheckedChange={setAvailableToday} />
              <Label htmlFor="available-today" className="text-[13px] font-medium text-slate-700">
                Available today
              </Label>
            </div>
          </div>
        </div>
        <FilterChips
          value={specialty}
          onChange={setSpecialty}
          options={[
            { value: 'all', label: 'All specialties', count: doctors.length },
            ...specialties.map(([s, count]) => ({ value: s, label: s, count })),
          ]}
        />
      </div>

      {isError ? (
        <ErrorState error={error} retry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[258px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={UserRoundSearch}
            title="No doctors match these filters"
            description="Try a different name or specialty, or turn off “Available today”."
            action={
              <Button variant="outline" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <DoctorCard key={d.id} doctor={d} />
          ))}
        </div>
      )}
    </>
  );
}
