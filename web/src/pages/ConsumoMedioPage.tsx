import { useAuth } from "../state/useAuth";
import EquipamentoConsumoPanel from "../components/dashboard/EquipamentoConsumoPanel";

export default function ConsumoMedioPage() {
  const { token } = useAuth();
  return <EquipamentoConsumoPanel token={token} variant="page" />;
}
