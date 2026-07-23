import { ProfileView } from "@/components/profile/profile-view";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <ProfileView name={decodeURIComponent(name)} />;
}
