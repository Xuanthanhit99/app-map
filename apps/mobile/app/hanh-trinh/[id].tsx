import { Redirect, useLocalSearchParams } from "expo-router";
/** Web URL /hanh-trinh/<id> (universal/app link) → native journey screen. */
export default function JourneyLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/journey/[id]", params: { id } }} />;
}
