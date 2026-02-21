import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { hotels, currentUser, showToast, type Hotel } from '../store';
import './HotelEdit.css';

export default function HotelEdit({ id }: { id?: string }) {
  const location = useLocation();
  const isEdit = id !== 'new';
  const existingHotel = hotels.value.find(h => h.id === id);

  const [form, setForm] = useState<Partial<Hotel>>(existingHotel || {
    name: '', address: '', price: 300, tags: [], status: '审核中'
  });

  const handleSave = () => {
    const name = (form.name || '').trim();
    const address = (form.address || '').trim();
    const price = Number(form.price ?? 0);

    const missing: string[] = [];
    if (!name) missing.push('酒店名称');
    if (!address) missing.push('详细地址');
    if (!price || price <= 0) missing.push('价格');

    if (missing.length > 0) {
      showToast(`请先填写完整必填项：${missing.join('、')}`);
      return;
    }

    if (isEdit) {
      hotels.value = hotels.value.map(h => h.id === id ? { ...h, ...form, status: '审核中' } as Hotel : h);
    } else {
      const newHotel: Hotel = { 
        ...form as Hotel,
        name,
        address,
        price,
        id: 'h_' + Date.now(), 
        merchantId: currentUser.value?.id || '', 
        status: '审核中' 
      };
      hotels.value = [...hotels.value, newHotel];
    }
    location.route('/merchant');
  };

  return (
    <div className="hotel-edit-page">
      <div className="hotel-edit-card">
      <h2 className="hotel-edit-title">{isEdit ? '编辑酒店信息' : '新酒店入驻'}</h2>
      <div className="hotel-edit-grid">
        <div className="hotel-edit-field hotel-edit-field-full">
          <label>酒店名称</label>
          <input className="hotel-edit-input" value={form.name} onInput={e => setForm({...form, name: e.currentTarget.value})} />
        </div>
        <div className="hotel-edit-field hotel-edit-field-full">
          <label>详细地址</label>
          <textarea className="hotel-edit-input" value={form.address} onInput={e => setForm({...form, address: e.currentTarget.value})} rows={3} />
        </div>
        <div className="hotel-edit-field">
          <label>价格 (元)</label>
          <input type="number" className="hotel-edit-input" value={form.price} onInput={e => setForm({...form, price: Number(e.currentTarget.value)})} />
        </div>
        <div className="hotel-edit-field">
          <label>体验标签 (逗号隔开)</label>
          <input className="hotel-edit-input" value={form.tags?.join(',')} onInput={e => setForm({...form, tags: e.currentTarget.value.split(',')})} placeholder="如：含早, 健身房" />
        </div>
      </div>
      <div className="hotel-edit-actions">
        <button type="button" onClick={handleSave} className="hotel-edit-submit">提交审核并保存</button>
        <button type="button" onClick={() => location.route('/merchant')} className="hotel-edit-cancel">取消</button>
      </div>
      </div>
    </div>
  );
}
