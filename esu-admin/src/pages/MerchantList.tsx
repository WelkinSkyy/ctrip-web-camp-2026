import { hotels, currentUser } from '../store';

export default function MerchantList() {
  const user = currentUser.value;
  
  // 过滤出当前商户自己的酒店
  const myHotels = hotels.value.filter(h => h.merchantId === user?.id);

  const deleteHotel = (id: string) => {
    if (confirm('确定要删除该酒店录入吗？')) {
      hotels.value = hotels.value.filter(h => h.id !== id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">我的酒店列表</h2>
          <p className="text-slate-500 text-sm mt-1">管理您已录入的酒店信息及查看审核进度</p>
        </div>
        <a 
          href="/hotel/edit/new" 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2"
        >
          <span>+ 录入新酒店</span>
        </a>
      </div>

      {myHotels.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-20 text-center">
          <p className="text-slate-400 font-medium">暂无酒店数据，请点击右上角新增</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myHotels.map(hotel => (
            <div key={hotel.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
              {/* 卡片头部：状态标签 */}
              <div className="p-5 border-b border-slate-50 flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 leading-tight">{hotel.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <span className="truncate max-w-[150px]">{hotel.address}</span>
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                  hotel.status === '通过' ? 'bg-green-100 text-green-700' :
                  hotel.status === '审核中' ? 'bg-amber-100 text-amber-700' : 
                  hotel.status === '不通过' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {hotel.status}
                </span>
              </div>

              {/* 卡片主体 */}
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-400 font-medium">预估均价</span>
                  <span className="text-xl font-black text-indigo-600">¥{hotel.price}<small className="text-xs font-normal text-slate-400 ml-1">起</small></span>
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  {hotel.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[10px] border border-slate-100">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* 驳回原因显示 */}
                {hotel.status === '不通过' && (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <p className="text-xs text-red-600 leading-relaxed font-medium">
                      <span className="font-bold">驳回原因：</span>{hotel.rejectReason || '信息不完整'}
                    </p>
                  </div>
                )}
              </div>

              {/* 卡片底部操作栏 */}
              <div className="px-5 py-4 bg-slate-50 flex gap-3">
                <a 
                  href={`/hotel/edit/${hotel.id}`} 
                  className="flex-1 text-center bg-white border border-slate-200 text-slate-600 py-2 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors"
                >
                  重新编辑
                </a>
                <button 
                  onClick={() => deleteHotel(hotel.id)}
                  className="px-4 bg-white border border-red-100 text-red-500 py-2 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
