/** How each kind of Library artifact looks, everywhere it appears. */
import type { ArtifactView } from "@shuacrew/core/projections";
import { Code2, Database, FileText, Globe, Image, Package } from "lucide-react";

type Kind = ArtifactView["kind"];

export const KIND: Record<Kind, { label: string; icon: typeof FileText; tone: string }> = {
  doc: { label: "Document", icon: FileText, tone: "#6cb6ff" },
  page: { label: "Page", icon: Globe, tone: "#f778ba" },
  code: { label: "Code", icon: Code2, tone: "#4ade80" },
  data: { label: "Data", icon: Database, tone: "#56d4dd" },
  image: { label: "Image", icon: Image, tone: "#ffb020" },
  file: { label: "File", icon: Package, tone: "#a9b1bd" },
};
