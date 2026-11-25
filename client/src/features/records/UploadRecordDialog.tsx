import { useRef, useState, type DragEvent } from 'react';
import { CloudUpload, FileImage, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, RECORD_CATEGORY_LABELS, type RecordCategory } from '@shared/constants';
import { Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { formatFileSize, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUploadRecord } from './api';
import { RECORD_META, UPLOAD_CATEGORIES } from './record-meta';

interface FormState {
  category: RecordCategory | '';
  title: string;
  recordDate: string;
  description: string;
}

type Errors = Partial<Record<'file' | keyof FormState, string>>;

const emptyForm = (): FormState => ({ category: '', title: '', recordDate: toDateStr(), description: '' });

function validateFile(file: File): string | null {
  if (!ALLOWED_UPLOAD_MIME.includes(file.type)) return 'Only PDF, PNG, JPG or WEBP files are allowed.';
  if (file.size > MAX_UPLOAD_BYTES) return `File is too large (max ${formatFileSize(MAX_UPLOAD_BYTES)}).`;
  if (file.size === 0) return 'This file is empty.';
  return null;
}

export function UploadRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [dragging, setDragging] = useState(false);
  const upload = useUploadRecord();

  const reset = () => {
    setFile(null);
    setForm(emptyForm());
    setErrors({});
    setDragging(false);
  };

  const close = (next: boolean) => {
    if (upload.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const pickFile = (picked: File | undefined | null) => {
    if (!picked) return;
    const problem = validateFile(picked);
    if (problem) {
      setErrors((e) => ({ ...e, file: problem }));
      setFile(null);
      return;
    }
    setFile(picked);
    setErrors((e) => ({ ...e, file: undefined }));
    if (!form.title.trim()) {
      const base = picked.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setForm((f) => ({ ...f, title: base.charAt(0).toUpperCase() + base.slice(1) }));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!file) next.file = 'Choose a file to upload.';
    if (!form.category) next.category = 'Select a category.';
    if (form.title.trim().length < 3) next.title = 'Give the document a title (at least 3 characters).';
    if (form.title.trim().length > 120) next.title = 'Title is too long (max 120 characters).';
    if (!form.recordDate) next.recordDate = 'Pick the date on the document.';
    else if (form.recordDate > toDateStr()) next.recordDate = 'The date cannot be in the future.';
    if (form.description.length > 500) next.description = 'Keep the description under 500 characters.';
    return next;
  };

  const submit = async () => {
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || !file || !form.category) return;
    try {
      await upload.mutateAsync({
        file,
        category: form.category,
        title: form.title.trim(),
        recordDate: form.recordDate,
        description: form.description.trim() || undefined,
      });
      toast.success('Document uploaded', { description: `${form.title.trim()} was added to your medical records.` });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const FileIcon = file?.type === 'application/pdf' ? FileText : FileImage;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-card sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display">Upload a medical document</DialogTitle>
          <DialogDescription>
            Add lab reports, scans, vaccination records or certificates to keep your health history in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div>
            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/50 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-teal-600 ring-1 ring-teal-600/15">
                  <FileIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Remove selected file" onClick={() => setFile(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  dragging ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-slate-50/60 hover:border-teal-300 hover:bg-teal-50/40',
                  errors.file && 'border-rose-300 bg-rose-50/40',
                )}
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-white text-teal-600 shadow-xs ring-1 ring-slate-200">
                  <CloudUpload className="size-5" />
                </span>
                <p className="text-sm font-medium text-slate-800">
                  Drag & drop a file here, or <span className="text-primary">browse</span>
                </p>
                <p className="text-xs text-muted-foreground">PDF, PNG, JPG or WEBP · up to {formatFileSize(MAX_UPLOAD_BYTES)}</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_UPLOAD_MIME.join(',')}
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {errors.file && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.file}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required error={errors.category}>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as RecordCategory }))}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(errors.category)}>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_CATEGORIES.map((c) => {
                    const Icon = RECORD_META[c].icon;
                    return (
                      <SelectItem key={c} value={c}>
                        <Icon className="size-4 text-slate-500" />
                        {RECORD_CATEGORY_LABELS[c]}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date on document" htmlFor="record-date" required error={errors.recordDate}>
              <Input
                id="record-date"
                type="date"
                max={toDateStr()}
                value={form.recordDate}
                aria-invalid={Boolean(errors.recordDate)}
                onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Title" htmlFor="record-title" required error={errors.title}>
            <Input
              id="record-title"
              value={form.title}
              maxLength={120}
              placeholder="e.g. Thyroid profile report"
              aria-invalid={Boolean(errors.title)}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="record-notes"
            error={errors.description}
            hint="Optional — lab name, findings or anything a doctor should know."
          >
            <Textarea
              id="record-notes"
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <CloudUpload />}
            Upload document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
