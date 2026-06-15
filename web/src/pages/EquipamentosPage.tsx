import CadastroAtivosPage from "../components/cadastro/CadastroAtivosPage";

export default function EquipamentosPage() {
  return (
    <CadastroAtivosPage
      fixedTipo="EQUIPAMENTO"
      title="Equipamentos"
      description={
        <>
          Cadastro dos <strong>equipamentos abastecidos</strong> (máquinas, veículos de obra, etc.). Informe se é{" "}
          <strong>estacionário</strong> ou <strong>móvel</strong> e use <strong>Importar</strong> para carregar uma
          planilha em lote.
        </>
      }
      ativoPlaceholder="Ex.: ASD123"
      nomePlaceholder="Ex.: Escavadeira CAT 320"
      emptyMessage="Nenhum equipamento cadastrado."
      addLabel="Adicionar equipamento"
      showMobilidade
      enableImport
    />
  );
}
