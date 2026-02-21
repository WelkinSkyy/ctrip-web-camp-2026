import { hotels } from '../store';
import './AuditList.css';

export default function AuditList() {
  const handleStatusChange = (id: string, nextStatus: any, reason?: string) => {
    hotels.value = hotels.value.map(h => 
      h.id === id ? { ...h, status: nextStatus, rejectReason: reason || '' } : h
    );
  };

  const auditStatusClass = (status: string) =>
    status === '通过' ? 'audit-status--passed' :
    status === '审核中' ? 'audit-status--pending' : 'audit-status--rejected';

  return (
    <div className="audit-page">
      <div className="audit-wrap">
      <div className="audit-header">
        <h2>酒店发布审核</h2>
        <p className="audit-header-desc">对待审核与已发布酒店进行通过、驳回或下线操作</p>
      </div>
      <table className="audit-table">
        <thead className="audit-thead">
          <tr>
            <th>酒店名</th>
            <th>标签</th>
            <th>状态</th>
            <th className="audit-th-actions">管理操作</th>
          </tr>
        </thead>
        <tbody className="audit-tbody">
          {hotels.value.map(h => (
            <tr key={h.id}>
              <td className="audit-name-cell">{h.name}<p className="audit-address">{h.address}</p></td>
              <td>
                <div className="audit-tags">
                  {h.tags.map(t => <span key={t} className="audit-tag">{t}</span>)}
                </div>
              </td>
              <td>
                <span className={`audit-status ${auditStatusClass(h.status)}`}>{h.status}</span>
              </td>
              <td className="audit-td-actions">
                {h.status === '审核中' ? (
                  <div className="audit-actions-row">
                    <button type="button" onClick={() => handleStatusChange(h.id, '通过')} className="audit-btn-approve">批准</button>
                    <button type="button" onClick={() => {
                      const r = prompt('理由:');
                      if (r) handleStatusChange(h.id, '不通过', r);
                    }} className="audit-btn-reject">驳回</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => handleStatusChange(h.id, h.status === '已下线' ? '通过' : '已下线')} className={`audit-btn-toggle ${h.status === '已下线' ? 'audit-btn-online' : 'audit-btn-offline'}`}>
                    {h.status === '已下线' ? '恢复上线' : '一键下线'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
