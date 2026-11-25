const SHORT: Record<string, string> = {
  'Computer Science & Engineering': 'CSE',
  'Electronics & Communication': 'ECE',
  'Electrical Engineering': 'EE',
  'Mechanical Engineering': 'ME',
  'Civil Engineering': 'CE',
  'Chemical Engineering': 'CHE',
  Biotechnology: 'BT',
  'Electronics & Instrumentation': 'EIC',
  'Mathematics & Computing': 'MnC',
  'Management (MBA)': 'MBA',
};

/** "Computer Science & Engineering" → "CSE" (falls back to initials). */
export function departmentShort(department: string): string {
  if (SHORT[department]) return SHORT[department];
  const initials = department
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== '&' && !['and', 'of'].includes(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return initials || department;
}
