import Image from "next/image";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OgInspectPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const src = `/share/og?${params.toString()}`;

  return (
    <main
      style={{
        margin: 0,
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        background: "#000",
      }}
    >
      <Image
        src={src}
        alt="OG inspection"
        width={1200}
        height={630}
        unoptimized
        priority
        style={{ display: "block", width: 1200, height: 630 }}
      />
    </main>
  );
}
