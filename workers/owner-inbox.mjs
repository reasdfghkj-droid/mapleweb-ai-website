/**
 * Privacy-safe in-app owner notification inbox.
 * NO email, push, SMS, webhook, or customer information is sent externally.
 * Access only from separately authenticated Private Manager Worker.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=Object.freeze(new Set(['NEW_REQUEST','REVISION_REQUESTED','READY_FOR_REVIEW','DELIVERY_RECORDED']));
export function notificationInsert(db,projectId,category,at=new Date().toISOString()){
  if(!db?.prepare||!UUID.test(projectId)||!TYPES.has(category))throw Error('Invalid notification');
  return db.prepare('INSERT INTO owner_notifications(id,project_id,category,created_at) VALUES (?,?,?,?)')
    .bind(crypto.randomUUID(),projectId,category,at);
}
export async function listOwnerNotifications(db,limit=40){
  if(!db?.prepare||!Number.isSafeInteger(limit)||limit<1||limit>100)
    return {ok:false,error:'Notification query unavailable'};
  const result=await db.prepare(
    'SELECT n.id,n.project_id,n.category,n.created_at,n.read_at,p.status '+
    'FROM owner_notifications n JOIN projects p ON p.id=n.project_id '+
    'ORDER BY (n.read_at IS NOT NULL),n.created_at DESC LIMIT ?'
  ).bind(limit).all();
  // Intentionally omit customer PII. Owner can open protected project detail.
  return {ok:true,notifications:result?.results||[],delivery:'IN_APP_ONLY',
    email_sent:false,push_sent:false};
}
export async function markNotificationRead(db,id){
  if(!db?.prepare||!UUID.test(id))return {ok:false,error:'Invalid notification reference'};
  const result=await db.prepare('UPDATE owner_notifications SET read_at=? WHERE id=? AND read_at IS NULL')
    .bind(new Date().toISOString(),id).run();
  return {ok:true,marked_read:(result?.meta?.changes||0)===1,external_delivery:false};
}
