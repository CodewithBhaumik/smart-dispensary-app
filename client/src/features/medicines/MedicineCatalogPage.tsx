import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ClipboardList, FileText, PackageCheck, PackageSearch, Pill, X } from 'lucide-react';
import { toast } from 'sonner';
import { MEDICINE_CATEGORIES, type FulfilmentMethod } from '@shared/constants';
import type { Medicine, MedicineRequest } from '@shared/types';
import { EmptyState, ErrorState, FilterChips, PageHeader, Panel, SearchInput } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { usePrescription } from '@/features/prescriptions/api';
import { prescriptionRequestState } from '@/features/prescriptions/prescription-state';
import { useCreateRequest, useMedicines } from './api';
import { defaultDeliveryLocation, linesFromPrescription, otcMax, type CartItem } from './cart';
import { MedicineCard, type AddState } from './MedicineCard';
import { MedicineDetailDialog } from './MedicineDetailDialog';
import { RequestPanel } from './RequestPanel';
import { RequestSuccessDialog } from './RequestSuccessDialog';

const ALL = '__all__';

function PrescriptionBanner({
  state,
  rx,
  unavailable,
  onExit,
}: {
  state: ReturnType<typeof prescriptionRequestState> | 'loading' | 'error';
  rx: { code: string; doctorName: string; validUntil: string } | null;
  unavailable: string[];
  onExit: () => void;
}) {
  if (state === 'loading') return <Skeleton className="mb-5 h-[68px] w-full rounded-xl" />;
  const shell = 'mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center';
  if (state === 'error' || !rx) {
    return (
      <div className={`${shell} border-rose-200 bg-rose-50/70`}>
        <AlertTriangle className="size-5 shrink-0 text-rose-500" />
        <p className="flex-1 text-sm text-rose-900">This prescription could not be loaded. You can still request over-the-counter medicines.</p>
        <Button size="sm" variant="outline" onClick={onExit}>
          Browse catalog
        </Button>
      </div>
    );
  }
  if (state.kind === 'open' || state.kind === 'dispensed') {
    return (
      <div className={`${shell} border-indigo-200 bg-indigo-50/60`}>
        <PackageCheck className="size-5 shrink-0 text-indigo-600" />
        <p className="flex-1 text-sm text-indigo-950">
          {state.kind === 'open' ? (
            <>
              You already have an open request <span className="font-mono font-semibold">{state.code}</span> for prescription{' '}
              <span className="font-mono font-semibold">{rx.code}</span>.
            </>
          ) : (
            <>
              Medicines for <span className="font-mono font-semibold">{rx.code}</span> were already dispensed (request{' '}
              <span className="font-mono font-semibold">{state.code}</span>).
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link to={`/student/requests?open=${state.requestId}`}>View request</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onExit}>
            Browse catalog
          </Button>
        </div>
      </div>
    );
  }
  if (state.kind === 'expired') {
    return (
      <div className={`${shell} border-amber-200 bg-amber-50/70`}>
        <AlertTriangle className="size-5 shrink-0 text-amber-600" />
        <p className="flex-1 text-sm text-amber-950">
          Prescription <span className="font-mono font-semibold">{rx.code}</span> expired on {formatDate(rx.validUntil)}. Book a
          follow-up visit for a new prescription.
        </p>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link to="/student/book">Book a visit</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onExit}>
            Browse catalog
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${shell} border-violet-200 bg-gradient-to-r from-violet-50 to-white`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-violet-600 ring-1 ring-violet-600/15">
        <FileText className="size-[18px]" />
      </span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-violet-950">
          Requesting medicines from <span className="font-mono">{rx.code}</span> · {rx.doctorName}
        </p>
        <p className="text-violet-900/80">
          Prescribed items are pre-filled in your request list. Prescription-only medicines are unlocked for this request.
        </p>
        {unavailable.length > 0 && (
          <p className="mt-1 text-xs font-medium text-amber-800">
            Currently out of stock: {unavailable.join(', ')} — the pharmacist can advise an alternative.
          </p>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={onExit} className="text-violet-800 hover:bg-violet-100">
        <X /> Exit
      </Button>
    </div>
  );
}

export default function MedicineCatalogPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rxParam = params.get('prescription');
  const prescriptionId = rxParam && Number(rxParam) > 0 ? Number(rxParam) : null;

  const medicines = useMedicines();
  const rxQuery = usePrescription(prescriptionId);
  const createRequest = useCreateRequest();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [otcOnly, setOtcOnly] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>('pickup');
  const [location, setLocation] = useState(() => defaultDeliveryLocation(user.student));
  const [notes, setNotes] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Medicine | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [success, setSuccess] = useState<MedicineRequest | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const preloadedFor = useRef<number | null>(null);

  const rx = rxQuery.data ?? null;
  const rxState = rx ? prescriptionRequestState(rx) : null;
  const activePrescription = rx && rxState?.kind === 'can_request' ? rx : null;
  const allowedRx = useMemo(() => new Set(activePrescription?.items.map((i) => i.medicineId) ?? []), [activePrescription]);

  // Pre-fill the request list from the prescription once both datasets are loaded.
  useEffect(() => {
    if (!activePrescription || !medicines.data) return;
    if (preloadedFor.current === activePrescription.id) return;
    preloadedFor.current = activePrescription.id;
    const { lines, unavailable: missing } = linesFromPrescription(activePrescription, medicines.data);
    setCart((current) => [...lines, ...current.filter((c) => !lines.some((l) => l.medicine.id === c.medicine.id) && !c.medicine.requiresPrescription)]);
    setUnavailable(missing);
  }, [activePrescription, medicines.data]);

  const exitPrescription = () => {
    preloadedFor.current = null;
    setUnavailable([]);
    setCart((current) => current.filter((c) => !c.fromPrescription));
    const next = new URLSearchParams(params);
    next.delete('prescription');
    setParams(next, { replace: true });
  };

  const list = medicines.data ?? [];

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of list) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    const ordered = [
      ...MEDICINE_CATEGORIES.filter((c) => counts.has(c)),
      ...[...counts.keys()].filter((c) => !(MEDICINE_CATEGORIES as readonly string[]).includes(c)).sort(),
    ];
    return [{ value: ALL, label: 'All', count: list.length }, ...ordered.map((c) => ({ value: c, label: c, count: counts.get(c) }))];
  }, [list]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (category !== ALL && m.category !== category) return false;
      if (inStockOnly && m.stockQuantity <= 0) return false;
      if (otcOnly && m.requiresPrescription) return false;
      if (!q) return true;
      return [m.name, m.genericName, m.category, m.manufacturer, m.form].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [list, search, category, inStockOnly, otcOnly]);

  const addState = (m: Medicine): AddState => {
    const line = cart.find((c) => c.medicine.id === m.id);
    if (line) return { kind: 'in_cart', quantity: line.quantity, max: line.max };
    if (m.stockQuantity <= 0) return { kind: 'out_of_stock' };
    if (m.requiresPrescription && !allowedRx.has(m.id)) return { kind: 'needs_prescription' };
    return { kind: 'addable', max: otcMax(m) };
  };

  const add = (m: Medicine) => {
    const state = addState(m);
    if (state.kind !== 'addable') return;
    if (cart.length >= 10) {
      toast.error('A request can include up to 10 different medicines.');
      return;
    }
    let line: CartItem = { medicine: m, quantity: 1, max: state.max, fromPrescription: false };
    if (activePrescription && allowedRx.has(m.id)) {
      // Rx item re-added after removal: restore prescription limits.
      const rxItem = activePrescription.items.find((i) => i.medicineId === m.id)!;
      const { lines } = linesFromPrescription({ ...activePrescription, items: [rxItem] }, [m]);
      if (lines[0]) line = lines[0];
    }
    setCart((c) => [...c, line]);
    toast.success(`${m.name} added`, { description: 'Review quantities in your request list.', duration: 2500 });
  };

  const setQuantity = (id: number, quantity: number) => {
    if (quantity <= 0) {
      setCart((c) => c.filter((l) => l.medicine.id !== id));
      return;
    }
    setCart((c) => c.map((l) => (l.medicine.id === id ? { ...l, quantity: Math.min(quantity, l.max) } : l)));
  };

  const removeLine = (id: number) => setCart((c) => c.filter((l) => l.medicine.id !== id));

  const submit = async () => {
    if (cart.length === 0) return;
    if (fulfilment === 'delivery' && location.trim().length < 3) {
      setLocationError('Enter where the medicines should be delivered.');
      setMobileOpen(true);
      return;
    }
    setLocationError(null);
    const usesPrescription = Boolean(activePrescription && cart.some((c) => c.fromPrescription || allowedRx.has(c.medicine.id)));
    try {
      const created = await createRequest.mutateAsync({
        items: cart.map((c) => ({ medicineId: c.medicine.id, quantity: c.quantity })),
        prescriptionId: usesPrescription ? activePrescription!.id : undefined,
        fulfilment,
        deliveryLocation: fulfilment === 'delivery' ? location.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      setCart([]);
      setNotes('');
      setMobileOpen(false);
      setSuccess(created);
      if (prescriptionId) {
        preloadedFor.current = null;
        const next = new URLSearchParams(params);
        next.delete('prescription');
        setParams(next, { replace: true });
      }
    } catch (e) {
      toast.error('Request not submitted', { description: getErrorMessage(e) });
    }
  };

  const panelProps = {
    items: cart,
    prescription: activePrescription,
    fulfilment,
    location,
    notes,
    locationError,
    submitting: createRequest.isPending,
    onQuantity: setQuantity,
    onRemove: removeLine,
    onClear: () => setCart([]),
    onFulfilment: (v: FulfilmentMethod) => {
      setFulfilment(v);
      setLocationError(null);
    },
    onLocation: (v: string) => {
      setLocation(v);
      if (locationError) setLocationError(null);
    },
    onNotes: setNotes,
    onSubmit: submit,
  };

  const bannerState = prescriptionId
    ? rxQuery.isLoading
      ? ('loading' as const)
      : rxQuery.error || !rx
        ? ('error' as const)
        : rxState!
    : null;

  return (
    <>
      <PageHeader
        title="Medicines"
        description="Browse the dispensary formulary and request medicines for pickup or delivery on campus."
        actions={
          <Button asChild variant="outline">
            <Link to="/student/requests">
              <PackageCheck /> My requests
            </Link>
          </Button>
        }
      />

      {bannerState && (
        <PrescriptionBanner
          state={bannerState}
          rx={rx ? { code: rx.code, doctorName: rx.doctor.name, validUntil: rx.validUntil } : null}
          unavailable={unavailable}
          onExit={exitPrescription}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel padded={false}>
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search medicines, e.g. paracetamol"
                  className="sm:w-80"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id="in-stock-only" checked={inStockOnly} onCheckedChange={setInStockOnly} />
                    <Label htmlFor="in-stock-only" className="text-[13px] text-slate-700">
                      In stock only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="otc-only" checked={otcOnly} onCheckedChange={setOtcOnly} />
                    <Label htmlFor="otc-only" className="text-[13px] text-slate-700">
                      No prescription needed
                    </Label>
                  </div>
                </div>
              </div>
              <FilterChips options={categoryOptions} value={category} onChange={setCategory} />
            </div>
          </Panel>

          {medicines.error ? (
            <ErrorState error={medicines.error} retry={() => void medicines.refetch()} />
          ) : medicines.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-[178px] rounded-xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Panel>
              <EmptyState
                icon={PackageSearch}
                title="No medicines found"
                description="Try another name or remove some filters."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setCategory(ALL);
                      setInStockOnly(false);
                      setOtcOnly(false);
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </Panel>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Showing {visible.length} of {list.length} medicines
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((m) => (
                  <MedicineCard
                    key={m.id}
                    medicine={m}
                    state={addState(m)}
                    onOpen={() => setDetail(m)}
                    onAdd={() => add(m)}
                    onQuantity={(q) => setQuantity(m.id, q)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <RequestPanel {...panelProps} className="max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin" />
          </div>
        </aside>
      </div>

      {/* Mobile request list */}
      <div className="fixed right-4 bottom-4 z-30 lg:hidden">
        <Button size="lg" className="rounded-full shadow-lg" onClick={() => setMobileOpen(true)}>
          <ClipboardList /> Request list
          {cart.length > 0 && (
            <span className="ml-1 rounded-full bg-white/25 px-2 text-xs font-semibold tabular-nums">{cart.length}</span>
          )}
        </Button>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-background p-3 sm:max-w-md">
          <SheetTitle className="sr-only">Request list</SheetTitle>
          <SheetDescription className="sr-only">Review medicines and submit your request</SheetDescription>
          <div className="pt-8">
            <RequestPanel {...panelProps} />
          </div>
        </SheetContent>
      </Sheet>

      <MedicineDetailDialog
        medicine={detail}
        state={detail ? addState(detail) : null}
        onClose={() => setDetail(null)}
        onAdd={() => detail && add(detail)}
        onQuantity={(q) => detail && setQuantity(detail.id, q)}
      />
      <RequestSuccessDialog request={success} onClose={() => setSuccess(null)} />

      {list.length > 0 && (
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <Pill className="size-3.5" /> Information shown is general guidance only. Always follow your doctor&apos;s advice.
        </p>
      )}
    </>
  );
}
