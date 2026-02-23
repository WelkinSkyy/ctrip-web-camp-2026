import { useEffect, useState } from 'preact/hooks';
import { hotels, showToast } from '../store';
import { getToken } from '../api/request';
import {
  listAdmin,
  getHotel,
  approveHotel,
  rejectHotel,
  offlineHotel,
  onlineHotel,
  mapBackendToFrontend,
  type BackendHotel,
} from '../api/hotel';
import './AuditList.css';

const STATUS_MAP: Record<string, string> = {
  pending: '审核中',
  approved: '通过',
  rejected: '不通过',
  offline: '已下线',
};

export default function AuditList() {
  const [loading, setLoading] = useState(true);
  const [modalId, setModalId] = useState<string | null>(null);
  const [modalDetail, setModalDetail] = useState<BackendHotel | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = () => {
    if (!getToken()) {
      hotels.value = [];
      setLoading(false);
      return;
    }
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

  const openModal = (id: string) => {
    setModalId(id);
    setModalDetail(null);
    setRejectReason('');
    setModalLoading(true);
    getHotel(id)
      .then((h) => {
        setModalDetail(h);
        setRejectReason(h.statusDescription ?? '');
      })
      .catch((e) => {
        showToast(e instanceof Error ? e.message : '加载详情失败');
        setModalId(null);
      })
      .finally(() => setModalLoading(false));
  };

  const closeModal = () => {
    setModalId(null);
    setModalDetail(null);
    setRejectReason('');
  };

  const refreshModal = () => {
    if (!modalId) return;
    getHotel(modalId)
      .then((h) => {
        setModalDetail(h);
        setRejectReason(h.statusDescription ?? '');
      })
      .catch(() => {});
  };

  const handleApprove = async (id: string) => {
    try {
      await approveHotel(id);
      hotels.value = hotels.value.map((h) => (h.id === id ? { ...h, status: '通过' as const } : h));
      if (modalId === id) refreshModal();
      showToast('已通过');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleReject = async (id: string, reasonFromModal?: string) => {
    const reason = (reasonFromModal ?? (modalId === id ? rejectReason.trim() : '')).trim() || (typeof prompt !== 'undefined' ? (prompt('请输入驳回理由：') ?? '').trim() : '');
    if (!reason) {
      showToast('请填写驳回理由');
      return;
    }
    try {
      await rejectHotel(id, reason);
      hotels.value = hotels.value.map((h) =>
        h.id === id ? { ...h, status: '不通过' as const, rejectReason: reason } : h
      );
      if (modalId === id) refreshModal();
      showToast('已驳回');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleOffline = async (id: string) => {
    try {
      await offlineHotel(id);
      hotels.value = hotels.value.map((h) => (h.id === id ? { ...h, status: '已下线' as const } : h));
      if (modalId === id) refreshModal();
      showToast('已下线');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleOnline = async (id: string) => {
    try {
      await onlineHotel(id);
      hotels.value = hotels.value.map((h) => (h.id === id ? { ...h, status: '通过' as const } : h));
      if (modalId === id) refreshModal();
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
          <p className="audit-header-desc">点击酒店行查看详情，在弹窗中批准或驳回</p>
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
                  <tr key={h.id} className="audit-row-clickable" onClick={() => openModal(h.id)}>
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
                    <td className="audit-td-actions" onClick={(e) => e.stopPropagation()}>
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
                            onClick={() => handleReject(h.id, undefined)}
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

      {modalId && (
        <div className="audit-modal-overlay" onClick={closeModal}>
          <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="audit-modal-header">
              <h3 className="audit-modal-title">酒店详情</h3>
              <button type="button" className="audit-modal-close" onClick={closeModal} aria-label="关闭">×</button>
            </div>
            {modalLoading ? (
              <div className="audit-modal-loading">加载中…</div>
            ) : modalDetail ? (
              <>
                <div className="audit-modal-status-row">
                  <span className={`audit-status ${auditStatusClass(STATUS_MAP[modalDetail.status] ?? modalDetail.status)}`}>
                    {STATUS_MAP[modalDetail.status] ?? modalDetail.status}
                  </span>
                  {(modalDetail.status === 'pending' || modalDetail.status === 'rejected') && (
                    <div className="audit-modal-reject-reason">
                      <label>驳回理由（驳回时必填）</label>
                      <input
                        type="text"
                        className="audit-modal-input"
                        value={rejectReason}
                        onInput={(e) => setRejectReason(e.currentTarget.value)}
                        placeholder="输入驳回理由"
                      />
                    </div>
                  )}
                </div>
                <div className="audit-modal-form">
                  <div className="audit-modal-field">
                    <label>酒店名称（中文）</label>
                    <p className="audit-modal-value">{modalDetail.nameZh || '—'}</p>
                  </div>
                  <div className="audit-modal-field">
                    <label>酒店名称（英文）</label>
                    <p className="audit-modal-value">{modalDetail.nameEn || '—'}</p>
                  </div>
                  <div className="audit-modal-field">
                    <label>地址</label>
                    <p className="audit-modal-value">{modalDetail.address || '—'}</p>
                  </div>
                  <div className="audit-modal-field-row">
                    <div className="audit-modal-field">
                      <label>开业日期</label>
                      <p className="audit-modal-value">{(modalDetail.openingDate ?? '').replace(/T.*$/, '') || '—'}</p>
                    </div>
                    <div className="audit-modal-field">
                      <label>星级</label>
                      <p className="audit-modal-value">{modalDetail.starRating ?? '—'} 星</p>
                    </div>
                  </div>
                  <div className="audit-modal-field">
                    <label>设施</label>
                    <p className="audit-modal-value">{(modalDetail.facilities ?? []).length ? (modalDetail.facilities ?? []).join('、') : '—'}</p>
                  </div>
                  <div className="audit-modal-field">
                    <label>标签</label>
                    <p className="audit-modal-value">{(modalDetail.tags ?? []).length ? (modalDetail.tags ?? []).join('、') : '—'}</p>
                  </div>
                  <div className="audit-modal-field">
                    <label>附近景点</label>
                    <p className="audit-modal-value">{(modalDetail.nearbyAttractions ?? []).length ? (modalDetail.nearbyAttractions ?? []).join('、') : '—'}</p>
                  </div>
                  {(modalDetail.images ?? []).length > 0 && (
                    <div className="audit-modal-field">
                      <label>图片</label>
                      <p className="audit-modal-value audit-modal-value--pre">{(modalDetail.images ?? []).join('\n')}</p>
                    </div>
                  )}
                  {modalDetail.roomTypes && modalDetail.roomTypes.length > 0 && (
                    <div className="audit-modal-field">
                      <label>房型</label>
                      <ul className="audit-modal-room-types">
                        {modalDetail.roomTypes.map((r) => (
                          <li key={r.id}>{r.name} — ¥{r.price}，库存 {r.stock}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="audit-modal-actions">
                  {modalDetail.status === 'pending' && (
                    <>
                      <button type="button" className="audit-modal-btn audit-modal-btn-approve" onClick={() => handleApprove(modalId)}>批准</button>
                      <button type="button" className="audit-modal-btn audit-modal-btn-reject" onClick={() => handleReject(modalId, rejectReason.trim())}>驳回</button>
                    </>
                  )}
                  {(modalDetail.status === 'approved' || modalDetail.status === 'rejected') && (
                    <button
                      type="button"
                      className="audit-modal-btn audit-modal-btn-toggle"
                      onClick={() => modalDetail.status === 'offline' ? handleOnline(modalId) : handleOffline(modalId)}
                    >
                      {modalDetail.status === 'offline' ? '恢复上线' : '一键下线'}
                    </button>
                  )}
                  <button type="button" className="audit-modal-btn audit-modal-btn-cancel" onClick={closeModal}>关闭</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
