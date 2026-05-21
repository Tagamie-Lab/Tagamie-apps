import {
  Document,
  Link,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type {
  Asset,
  CanonicalInvoice,
  CanonicalInvoiceLineItem,
  CanonicalInvoiceTaxLine,
} from "./canonical";
import { explorerName, txExplorerUrl } from "./canonical";
import { registerInvoiceFonts } from "./fonts";

// ---- formatters ---------------------------------------------------------

function formatMoney(minor: bigint, asset: Asset): string {
  if (asset === "JPYC") {
    return `¥${(minor / 10n ** 18n).toLocaleString()}`;
  }
  // USDC: 6 decimals
  const whole = minor / 1_000_000n;
  const frac = minor % 1_000_000n;
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0")} USDC`;
}

function formatPeriodHeading(invoice: CanonicalInvoice): string {
  const [y, m] = invoice.periodMonth.split("-");
  return `${Number(y)} 年 ${Number(m)} 月分`;
}

function formatPeriodRange(invoice: CanonicalInvoice): string {
  // Render in JST: shift by +9h then take YYYY-MM-DD off the ISO string.
  const fromJst = new Date(invoice.periodFrom.getTime() + 9 * 60 * 60 * 1000);
  const toJst = new Date(invoice.periodTo.getTime() + 9 * 60 * 60 * 1000);
  return `${fromJst.toISOString().slice(0, 10)} 〜 ${toJst.toISOString().slice(0, 10)}`;
}

function formatTxTimestamp(d: Date): string {
  // Display in JST
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const iso = jst.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function formatTaxRate(bps: number): string {
  return `${bps / 100}%`;
}

/**
 * Format a single tax-rate row so that the displayed subtotal + tax === displayed total
 * even after currency-unit truncation (1 ¥ drift problem when floor-dividing wei to yen).
 *
 * Strategy: keep displayed subtotal as floor(subtotal_minor), then derive displayed tax as
 * (displayed_total - displayed_subtotal) — same accounting convention as W2's wei-level
 * `tax = total - subtotal` rule (tax absorbs the rounding, buyer-favorable).
 */
function formatTaxLineForDisplay(
  subtotalMinor: bigint,
  taxMinor: bigint,
  asset: Asset,
): { subtotal: string; tax: string; total: string } {
  if (asset === "JPYC") {
    const ONE = 10n ** 18n;
    const subtotalYen = subtotalMinor / ONE;
    const totalYen = (subtotalMinor + taxMinor) / ONE;
    const taxYen = totalYen - subtotalYen;
    return {
      subtotal: `¥${subtotalYen.toLocaleString()}`,
      tax: `¥${taxYen.toLocaleString()}`,
      total: `¥${totalYen.toLocaleString()}`,
    };
  }
  // USDC: 6-decimal precision is shown in full, so wei-level identity holds in display too.
  return {
    subtotal: formatMoney(subtotalMinor, asset),
    tax: formatMoney(taxMinor, asset),
    total: formatMoney(subtotalMinor + taxMinor, asset),
  };
}

// ---- styles -------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    color: "#111",
    lineHeight: 1.4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 4,
    lineHeight: 1.2,
    marginBottom: 6,
  },
  invoiceNo: {
    fontSize: 10,
    color: "#444",
  },
  issuedAt: {
    fontSize: 9,
    color: "#666",
  },
  twoCol: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 18,
  },
  party: { flex: 1 },
  partyLabel: {
    fontSize: 9,
    color: "#666",
    marginBottom: 2,
  },
  partyName: {
    fontSize: 12,
    fontWeight: 700,
  },
  partyMeta: {
    fontSize: 9,
    color: "#444",
  },
  metaTable: {
    marginBottom: 18,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#bbb",
  },
  metaRow: {
    flexDirection: "row",
    paddingVertical: 2,
  },
  metaKey: {
    width: 90,
    color: "#666",
    fontSize: 9,
  },
  metaVal: {
    flex: 1,
    fontSize: 10,
  },
  totalBlock: {
    marginVertical: 16,
    padding: 12,
    backgroundColor: "#f4f4f5",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 11, color: "#444" },
  totalValue: { fontSize: 18, fontWeight: 700 },
  taxTable: {
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: "#aaa",
  },
  taxHead: {
    flexDirection: "row",
    backgroundColor: "#eee",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: 700,
  },
  taxRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 0.5,
    borderColor: "#ddd",
    fontSize: 10,
  },
  taxCellRate: { width: 70 },
  taxCellNum: { flex: 1, textAlign: "right" },
  sectionHeading: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 6,
    marginBottom: 6,
  },
  itemsTable: { borderTopWidth: 0.5, borderColor: "#bbb" },
  itemsHead: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 9,
    fontWeight: 700,
    borderBottomWidth: 0.5,
    borderColor: "#bbb",
  },
  itemsRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.25,
    borderColor: "#eee",
    fontSize: 9,
  },
  itemsCellDate: { width: 110, paddingRight: 8 },
  itemsCellAmount: { width: 80, paddingRight: 12, textAlign: "right" },
  itemsCellChain: { width: 64, paddingRight: 8 },
  itemsCellTx: {
    flex: 1,
    fontSize: 8,
    color: "#0055cc",
  },
  exemptionBadge: {
    marginLeft: 8,
    fontSize: 8,
    color: "#1d4ed8",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  footnote: {
    marginTop: 16,
    fontSize: 8,
    color: "#666",
  },
  disclaimer: {
    position: "absolute",
    fontSize: 7,
    bottom: 34,
    left: 32,
    right: 32,
    textAlign: "center",
    color: "#666",
    lineHeight: 1.3,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 24,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#999",
  },
});

// 国税庁 適格請求書発行事業者公表システム Web-API 利用規約 第 6 条「情報の取得元の明示」義務。
// PDF と verify 画面の両方に出典表記を必須化する。
// CJK は単語境界が無いため fontkit の auto-hyphenation で「保証-/された」のように
// 強制ハイフン挿入が起きる。文節で改行コードを明示的に入れて回避する。
// Source: knowledge/nta.md §利用規約 第 6 条
const NTA_DISCLAIMER =
  "本書面の登録番号情報は、国税庁 適格請求書発行事業者公表システム Web-API 機能を利用して取得した情報をもとに作成しているが、\n国税庁によって保証されたものではない。";

// ---- subcomponents ------------------------------------------------------

function Header({ invoice }: { invoice: CanonicalInvoice }) {
  return (
    <View style={styles.headerRow} fixed>
      <View>
        <Text style={styles.title}>適格請求書</Text>
        <Text style={styles.invoiceNo}>No. {invoice.invoiceNumber}</Text>
      </View>
      <View style={{ textAlign: "right" }}>
        <Text style={styles.issuedAt}>発行日: {formatTxTimestamp(new Date()).slice(0, 10)}</Text>
        <Text style={styles.issuedAt}>通貨: {invoice.asset}</Text>
      </View>
    </View>
  );
}

function Parties({ invoice }: { invoice: CanonicalInvoice }) {
  return (
    <View style={styles.twoCol}>
      <View style={styles.party}>
        <Text style={styles.partyLabel}>発行者</Text>
        <Text style={styles.partyName}>{invoice.seller.legalName}</Text>
        {invoice.seller.displayName !== invoice.seller.legalName && (
          <Text style={styles.partyMeta}>（{invoice.seller.displayName}）</Text>
        )}
        <Text style={styles.partyMeta}>登録番号: {invoice.seller.taxNumber}</Text>
      </View>
      <View style={styles.party}>
        <Text style={styles.partyLabel}>受領者</Text>
        <Text style={styles.partyName}>
          {invoice.buyer.legalName ?? "—"} {invoice.buyer.legalName ? "御中" : ""}
        </Text>
        <Text style={styles.partyMeta}>
          Wallet: {invoice.buyer.walletAddress.slice(0, 10)}…
          {invoice.buyer.walletAddress.slice(-6)}
        </Text>
        {invoice.buyer.taxNumber && (
          <Text style={styles.partyMeta}>登録番号: {invoice.buyer.taxNumber}</Text>
        )}
      </View>
    </View>
  );
}

function MetaTable({ invoice }: { invoice: CanonicalInvoice }) {
  return (
    <View style={styles.metaTable}>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>取引年月日</Text>
        <Text style={styles.metaVal}>
          {formatPeriodHeading(invoice)}（{formatPeriodRange(invoice)}）
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>取引内容</Text>
        <Text style={styles.metaVal}>
          {invoice.transactionDescription ?? "API 利用料（x402 経由）"}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>件数</Text>
        <Text style={styles.metaVal}>
          {invoice.lineItems.length} 件
          {invoice.smallAmountExemptionApplied && (
            <Text style={styles.exemptionBadge}>
              {" "}
              (うち 1 万円未満該当あり ※)
            </Text>
          )}
        </Text>
      </View>
      {invoice.smallAmountExemptionApplied && (
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}> </Text>
          <Text style={[styles.metaVal, { fontSize: 8, color: "#666" }]}>
            ※ 1 万円未満の取引について、 買い手が課税売上高 1 億円以下の事業者
            の場合は少額特例 (消費税法 30 条の 2、 期限 2029-09-30) で適格請求書の
            保存が不要になる可能性があります。 適用判断は買い手側で行ってください。
          </Text>
        </View>
      )}
    </View>
  );
}

function TaxBreakdown({
  invoice,
  lines,
}: {
  invoice: CanonicalInvoice;
  lines: CanonicalInvoiceTaxLine[];
}) {
  return (
    <View>
      <Text style={styles.sectionHeading}>税率ごとの内訳</Text>
      <View style={styles.taxTable}>
        <View style={styles.taxHead}>
          <Text style={styles.taxCellRate}>税率</Text>
          <Text style={styles.taxCellNum}>対価（税抜）</Text>
          <Text style={styles.taxCellNum}>消費税額等</Text>
          <Text style={styles.taxCellNum}>合計（税込）</Text>
        </View>
        {lines.map((l) => {
          const display = formatTaxLineForDisplay(
            l.subtotalMinor,
            l.taxMinor,
            invoice.asset,
          );
          return (
            <View key={l.taxRateBps} style={styles.taxRow}>
              <Text style={styles.taxCellRate}>{formatTaxRate(l.taxRateBps)}</Text>
              <Text style={styles.taxCellNum}>{display.subtotal}</Text>
              <Text style={styles.taxCellNum}>{display.tax}</Text>
              <Text style={styles.taxCellNum}>{display.total}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function GrandTotal({ invoice }: { invoice: CanonicalInvoice }) {
  return (
    <View style={styles.totalBlock}>
      <Text style={styles.totalLabel}>合計（税込）</Text>
      <Text style={styles.totalValue}>{formatMoney(invoice.totalMinor, invoice.asset)}</Text>
    </View>
  );
}

function LineItems({
  invoice,
  items,
}: {
  invoice: CanonicalInvoice;
  items: CanonicalInvoiceLineItem[];
}) {
  return (
    <View>
      <Text style={styles.sectionHeading}>取引明細（on-chain 記録）</Text>
      <View style={styles.itemsTable}>
        <View style={styles.itemsHead} fixed>
          <Text style={styles.itemsCellDate}>取引日時 (JST)</Text>
          <Text style={styles.itemsCellAmount}>金額</Text>
          <Text style={styles.itemsCellChain}>chain</Text>
          <Text style={styles.itemsCellTx}>tx hash / explorer</Text>
        </View>
        {items.map((it, i) => (
          <View key={`${it.chain}-${it.txHash}-${i}`} style={styles.itemsRow} wrap={false}>
            <Text style={styles.itemsCellDate}>{formatTxTimestamp(it.occurredAt)}</Text>
            <Text style={styles.itemsCellAmount}>{formatMoney(it.amountMinor, invoice.asset)}</Text>
            <Text style={styles.itemsCellChain}>{it.chain}</Text>
            <Link src={txExplorerUrl(it.chain, it.txHash)} style={styles.itemsCellTx}>
              {it.txHash.slice(0, 10)}…{it.txHash.slice(-8)}
            </Link>
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>
        {`全 ${items.length} 件の on-chain settle event をこの請求書に紐付け済み。各 tx の検証は ${explorerNames(items)} で確認可能。`}
      </Text>
    </View>
  );
}

function explorerNames(items: CanonicalInvoiceLineItem[]): string {
  const names = new Set(items.map((i) => explorerName(i.chain)));
  return Array.from(names).join(" / ");
}

// ---- document -----------------------------------------------------------

export function InvoiceDocument({ invoice }: { invoice: CanonicalInvoice }) {
  return (
    <Document
      title={`適格請求書 ${invoice.invoiceNumber}`}
      author={invoice.seller.legalName}
      subject={`${invoice.periodMonth} 分 適格請求書`}
    >
      <Page size="A4" style={styles.page}>
        <Header invoice={invoice} />
        <Parties invoice={invoice} />
        <MetaTable invoice={invoice} />
        <TaxBreakdown invoice={invoice} lines={invoice.taxLines} />
        <GrandTotal invoice={invoice} />
        <LineItems invoice={invoice} items={invoice.lineItems} />
        <Text style={styles.disclaimer} fixed>
          {NTA_DISCLAIMER}
        </Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: CanonicalInvoice): Promise<Buffer> {
  registerInvoiceFonts();
  return await renderToBuffer(<InvoiceDocument invoice={invoice} />);
}
