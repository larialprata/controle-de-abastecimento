import CadastroAtivosPage from "../components/cadastro/CadastroAtivosPage";

export default function EquipamentosPage() {
  return (
    <CadastroAtivosPage
      fixedTipo="EQUIPAMENTO"
      title="Equipamentos"
      description={
        <>
          Cadastro dos <strong>equipamentos abastecidos</strong>. Marque apenas se for da{" "}
          <strong>Dimensional</strong>; caso contrário é <strong>Terceirizado</strong>. Informe também se é{" "}
          <strong>estacionário</strong> ou <strong>móvel</strong>. Clique no <strong>ativo</strong> ou na{" "}
          <strong>descrição</strong> para ver o QR code. Use <strong>Exportar QR</strong> para imprimir em lote.
        </>
      }
      ativoPlaceholder="Ex.: ASD123"
      nomePlaceholder="Ex.: Escavadeira CAT 320"
      emptyMessage="Nenhum equipamento cadastrado."
      addLabel="Adicionar equipamento"
      showMobilidade
      showEmpresa
      enableImport
      enableBulkSelect
      enableQrCode
    />
  );
}
