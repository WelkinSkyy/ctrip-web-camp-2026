import { useEffect, useState } from 'preact/hooks';
import { hotels, currentUser, showToast } from '../store';
import { listMerchant, deleteHotel, mapBackendToFrontend } from '../api/hotel';
import './MerchantList.css';

export default function MerchantList() {
  const user = currentUser.value;
  const [loading, setLoading] = useState(true);
  const myHotels = hotels.value;

  const load = () => {
    setLoading(true);
    listMerchant()
      .then((res) => {
        hotels.value = res.hotels.map(mapBackendToFrontend);
      })
      .catch((e) => {
        showToast(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.role === 'merchant') load();
  }, [user?.id]);

  const deleteHotelById = async (id: string) => {
    if (!confirm('确定要删除该酒店录入吗？')) return;
    try {
      await deleteHotel(id);
      hotels.value = hotels.value.filter((h) => h.id !== id);
      showToast('已删除');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      showToast(msg.includes('403') || msg.includes('权限') ? '仅管理员可删除酒店' : msg || '删除失败');
    }
  };

  const statusClass = (status: string) =>
    status === '通过' ? 'merchant-status--passed' :
    status === '审核中' ? 'merchant-status--pending' :
    status === '不通过' ? 'merchant-status--rejected' : 'merchant-status--offline';

  return (
    <div className="merchant-page">
      <div className="merchant-head">
        <div>
          <h2 className="merchant-head-title">我的酒店列表</h2>
          <p className="merchant-head-desc">管理您已录入的酒店信息及查看审核进度</p>
        </div>
        <a href="/hotel/edit/new" className="merchant-add-btn">
          <span>+ 录入新酒店</span>
        </a>
      </div>

      {loading ? (
        <div className="merchant-empty">
          <p>加载中…</p>
        </div>
      ) : myHotels.length === 0 ? (
        <div className="merchant-empty">
          <p>暂无酒店数据，请点击右上角新增</p>
        </div>
      ) : (
        <div className="merchant-grid">
          {myHotels.map((hotel) => (
            <div key={hotel.id} className="merchant-card">
              <div className="merchant-card-head">
                <div>
                  <h3 className="merchant-card-title">{hotel.name}</h3>
                  <p className="merchant-card-address">
                    <span>{hotel.address}</span>
                  </p>
                </div>
                <span className={`merchant-status ${statusClass(hotel.status)}`}>
                  {hotel.status}
                </span>
              </div>

              <div className="merchant-card-body">
                <div className="merchant-price-row">
                  <span className="merchant-price-label">预估均价</span>
                  <span className="merchant-price-value">
                    ¥{hotel.price || '-'}<small className="merchant-price-unit">起</small>
                  </span>
                </div>
                <div className="merchant-tags">
                  {hotel.tags.map((tag, i) => (
                    <span key={i} className="merchant-tag">{tag}</span>
                  ))}
                </div>
                {hotel.status === '不通过' && (
                  <div className="merchant-reject-box">
                    <p><span className="reject-label">驳回原因：</span>{hotel.rejectReason || '信息不完整'}</p>
                  </div>
                )}
              </div>

              <div className="merchant-card-footer">
                <a href={`/hotel/edit/${hotel.id}`} className="merchant-btn-edit">重新编辑</a>
                <button type="button" onClick={() => deleteHotelById(hotel.id)} className="merchant-btn-delete">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
