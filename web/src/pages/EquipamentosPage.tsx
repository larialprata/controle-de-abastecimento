import CadastroAtivosPage from "../components/cadastro/CadastroAtivosPage";

export default function EquipamentosPage() {
  return (
    <CadastroAtivosPage
      fixedTipo="EQUIPAMENTO"
      title="Equipamentos"
      description={
        <>
          Cadastro dos <strong>equipamentos abastecidos</strong>. Informe a <strong>empresa</strong> proprietária
          (ex.: Dimensional, Construtora Alfa) e se é <strong>estacionário</strong> ou <strong>móvel</strong>. Clique
          no <strong>ativo</strong> ou na <strong>descrição</strong> para ver o QR code. Use{" "}
          <strong>Exportar QR</strong> para imprimir em lote.
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
