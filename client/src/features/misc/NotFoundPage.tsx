import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState, Panel } from '@/components/app';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <Panel className="mt-6">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The link may be outdated, or the page belongs to another role."
        action={
          <Button asChild>
            <Link to={`/${user.role}`}>Back to overview</Link>
          </Button>
        }
      />
    </Panel>
  );
}
