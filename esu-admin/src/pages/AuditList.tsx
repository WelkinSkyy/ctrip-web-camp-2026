import { useEffect, useState } from 'preact/hooks';
import { hotels, showToast } from '../store';
import {
  listAdmin,
  approveHotel,
  rejectHotel,
  offlineHotel,
  onlineHotel,
  mapBackendToFrontend,
} from '../api/hotel';
import './AuditList.css';

export default function AuditList() {
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listAdmin()
      .then((res) => {
        hotels.value = res.hotels.map(mapBackendToFrontend);
      })
      .catch((e) => {
        showToast(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await approveHotel(id);
      hotels.value = hotels.value.map((h) => (h.id === id ? { ...h, status: '通过' as const } : h));
      showToast('已通过');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('请输入驳回理由：');
    if (reason == null || !reason.trim()) return;
    try {
      await rejectHotel(id, reason.trim());
      hotels.value = hotels.value.map((h) =>
        h.id === id ? { ...h, status: '不通过' as const, rejectReason: reason.trim() } : h
      );
      showToast('已驳回');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleOffline = async (id: string) => {
    try {
      await offlineHotel(id);
      hotels.value = hotels.value.map((h) => (h.id === id ? { ...h, status: '已下线' as const } : h));
      showToast('已下线');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleOnline = async (id: string) => {
    try {
      await onlineHotel(id);
      hotels.value = hotels.value.map((h) => (h.id === id ? { ...h, status: '通过' as const } : h));
      showToast('已恢复上线');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const auditStatusClass = (status: string) =>
    status === '通过' ? 'audit-status--passed' :
    status === '审核中' ? 'audit-status--pending' : 'audit-status--rejected';

  const list = hotels.value;

  return (
    <div className="audit-page">
      <div className="audit-wrap">
        <div className="audit-header">
          <h2>酒店发布审核</h2>
          <p className="audit-header-desc">对待审核与已发布酒店进行通过、驳回或下线操作</p>
        </div>
        {loading ? (
          <div className="audit-loading">加载中…</div>
        ) : (
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
              {list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="audit-empty">
                    暂无酒店数据
                  </td>
                </tr>
              ) : (
                list.map((h) => (
                  <tr key={h.id}>
                    <td className="audit-name-cell">
                      {h.name}
                      <p className="audit-address">{h.address}</p>
                    </td>
                    <td>
                      <div className="audit-tags">
                        {h.tags.map((t) => (
                          <span key={t} className="audit-tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`audit-status ${auditStatusClass(h.status)}`}>{h.status}</span>
                    </td>
                    <td className="audit-td-actions">
                      {h.status === '审核中' ? (
                        <div className="audit-actions-row">
                          <button
                            type="button"
                            onClick={() => handleApprove(h.id)}
                            className="audit-btn-approve"
                          >
                            批准
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(h.id)}
                            className="audit-btn-reject"
                          >
                            驳回
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (h.status === '已下线' ? handleOnline(h.id) : handleOffline(h.id))}
                          className={h.status === '已下线' ? 'audit-btn-toggle audit-btn-online' : 'audit-btn-toggle audit-btn-offline'}
                        >
                          {h.status === '已下线' ? '恢复上线' : '一键下线'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
