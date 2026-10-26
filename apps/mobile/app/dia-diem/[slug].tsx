import { Redirect, useLocalSearchParams } from "expo-router";
/** Web URL /dia-diem/<slug> (universal/app link) → native place screen. */
export default function PlaceLink() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={{ pathname: "/place", params: { slug } }} />;
}
