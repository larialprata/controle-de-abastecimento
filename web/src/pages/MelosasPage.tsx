import CadastroAtivosPage from "../components/cadastro/CadastroAtivosPage";

export default function MelosasPage() {
  return (
    <CadastroAtivosPage
      fixedTipo="MELOSA"
      title="Melosas"
      description={
        <>
          Cadastro das <strong>melosas</strong> utilizadas no abastecimento. Os ativos cadastrados aparecem no app
          mobile para seleção da melosa e a capacidade em litros alimenta o controle de ciclos no dashboard.
        </>
      }
      ativoPlaceholder="Ex.: ABC1D23"
      nomePlaceholder="Ex.: Melosa caminhão 01"
      ativoHint="Este ativo aparecerá no app mobile para seleção da melosa."
      emptyMessage="Nenhuma melosa cadastrada."
      addLabel="Adicionar melosa"
      writePageKey="melosas"
    />
  );
}
