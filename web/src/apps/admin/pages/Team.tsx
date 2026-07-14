import { TeamManager } from '../components/TeamManager';

/** Super-only team / role management page. Route + nav are cap-gated to `roles`. */
export function AdminTeam() {
  return <TeamManager />;
}