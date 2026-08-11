import { getCompany } from "@/lib/queries/masters";
import { CompanyClient } from "./company-client";

export const dynamic = "force-dynamic";

export default async function CompanyMasterPage() {
  const company = await getCompany();
  return <CompanyClient company={company} />;
}
