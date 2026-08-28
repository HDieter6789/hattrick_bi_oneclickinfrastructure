import { DeploymentStatusView } from "@/components/deployments/deployment-status-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeploymentStatusPage({ params }: PageProps) {
  const { id } = await params;
  return <DeploymentStatusView deploymentId={id} />;
}
