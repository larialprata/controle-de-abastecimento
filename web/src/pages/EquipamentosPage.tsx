import CadastroAtivosPage from "../components/cadastro/CadastroAtivosPage";

export default function EquipamentosPage() {
  return (
    <CadastroAtivosPage
      fixedTipo="EQUIPAMENTO"
      title="Equipamentos"
      description={
        <>
      Cadastro dos <strong>equipamentos abastecidos</strong>. Associe o <strong>ativo</strong> à{" "}
      <strong>placa</strong> (ex.: REVTR02 = KVW2O9X), informe a <strong>empresa</strong> proprietária e se é{" "}
      <strong>estacionário</strong> ou <strong>móvel</strong>. Use <strong>Gerenciar empresas</strong> para
      cadastrar novas empresas. Clique no <strong>ativo</strong> ou na <strong>descrição</strong> para ver o QR
      code. Use <strong>Exportar QR</strong> para imprimir em lote.
        </>
      }
      ativoPlaceholder="Ex.: REVTR02"
      nomePlaceholder="Ex.: Escavadeira CAT 320"
      emptyMessage="Nenhum equipamento cadastrado."
      addLabel="Adicionar equipamento"
      showMobilidade
      showEmpresa
      showPlaca
      enableImport
      enableBulkSelect
      enableQrCode
      writePageKey="equipamentos"
    />
  );
}
