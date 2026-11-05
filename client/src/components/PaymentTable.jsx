import { formatDate, formatPrice, PAYMENT_LABELS } from '../format.js';

export default function PaymentTable({ payments, caption, showEmail = false }) {
  if (payments.length === 0) {
    return <p>Aucun paiement pour le moment.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {showEmail && <th scope="col">Membre</th>}
            <th scope="col">Formule</th>
            <th scope="col" className="numeric">
              Montant
            </th>
            <th scope="col">État</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{formatDate(payment.occurredAt)}</td>
              {showEmail && <td>{payment.email}</td>}
              <td>{payment.planName}</td>
              <td className="numeric">{formatPrice(payment.amountCents, payment.currency)}</td>
              <td>
                <span className={`tag tag-${payment.status}`}>{PAYMENT_LABELS[payment.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
