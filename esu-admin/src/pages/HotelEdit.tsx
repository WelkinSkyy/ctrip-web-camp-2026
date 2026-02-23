import { useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { hotels, currentUser, showToast, type Hotel } from '../store';
import { createHotel, updateHotel, getHotel, mapBackendToFrontend, type HotelCreateBody } from '../api/hotel';
import { FRONTEND_STATUS_MAP } from '../api/hotel';
import './HotelEdit.css';

const defaultOpeningDate = () => new Date().toISOString().slice(0, 10);

export default function HotelEdit({ id }: { id?: string }) {
  const location = useLocation();
  const isEdit = id !== 'new';
  const existingHotel = hotels.value.find((h) => h.id === id);

  const [form, setForm] = useState<Partial<Hotel> & { openingDate?: string }>(
    existingHotel
      ? { ...existingHotel, openingDate: defaultOpeningDate() }
      : { name: '', address: '', price: 0, tags: [], status: '审核中', openingDate: defaultOpeningDate() }
  );
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit && !existingHotel && !!id);

  useEffect(() => {
    if (!isEdit || !id || existingHotel) return;
    setFetching(true);
    getHotel(id)
      .then((h) => {
        const mapped = mapBackendToFrontend(h);
        setForm({
          ...mapped,
          openingDate: h.openingDate ?? defaultOpeningDate(),
        });
      })
      .catch(() => showToast('加载酒店失败'))
      .finally(() => setFetching(false));
  }, [id, isEdit, existingHotel]);

  const handleSave = async () => {
    const name = (form.name || '').trim();
    const address = (form.address || '').trim();
    const openingDate = form.openingDate || defaultOpeningDate();

    const missing: string[] = [];
    if (!name) missing.push('酒店名称');
    if (!address) missing.push('详细地址');
    if (!openingDate) missing.push('开业日期');

    if (missing.length > 0) {
      showToast(`请先填写完整必填项：${missing.join('、')}`);
      return;
    }

    const body: Partial<HotelCreateBody> = {
      nameZh: name,
      address,
      starRating: 3,
      openingDate,
      facilities: form.tags?.length ? form.tags : undefined,
    };
    const ownerId = currentUser.value?.id ? Number(currentUser.value.id) : undefined;
    if (ownerId) body.ownerId = ownerId;

    setLoading(true);
    try {
      if (isEdit && id) {
        await updateHotel(id, {
          nameZh: body.nameZh,
          address: body.address,
          starRating: body.starRating,
          openingDate: body.openingDate,
          facilities: body.facilities,
          status: FRONTEND_STATUS_MAP['审核中'],
        });
      } else {
        await createHotel(body as HotelCreateBody);
      }
      location.route('/merchant');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hotel-edit-page">
      <div className="hotel-edit-card">
        <h2 className="hotel-edit-title">{isEdit ? '编辑酒店信息' : '新酒店入驻'}</h2>
        <div className="hotel-edit-grid">
          <div className="hotel-edit-field hotel-edit-field-full">
            <label>酒店名称</label>
            <input
              className="hotel-edit-input"
              value={form.name}
              onInput={(e) => setForm({ ...form, name: e.currentTarget.value })}
              placeholder="中文名称"
            />
          </div>
          <div className="hotel-edit-field hotel-edit-field-full">
            <label>详细地址</label>
            <textarea
              className="hotel-edit-input"
              value={form.address}
              onInput={(e) => setForm({ ...form, address: e.currentTarget.value })}
              rows={3}
            />
          </div>
          <div className="hotel-edit-field">
            <label>开业日期</label>
            <input
              type="date"
              className="hotel-edit-input"
              value={form.openingDate ?? defaultOpeningDate()}
              onInput={(e) => setForm({ ...form, openingDate: e.currentTarget.value })}
            />
          </div>
          <div className="hotel-edit-field">
            <label>体验标签（逗号隔开）</label>
            <input
              className="hotel-edit-input"
              value={form.tags?.join(',')}
              onInput={(e) => setForm({ ...form, tags: e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="如：含早, 健身房"
            />
          </div>
        </div>
        <div className="hotel-edit-actions">
          <button type="button" onClick={handleSave} className="hotel-edit-submit" disabled={loading}>
            {loading ? '提交中…' : '提交审核并保存'}
          </button>
          <button type="button" onClick={() => location.route('/merchant')} className="hotel-edit-cancel" disabled={loading}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
