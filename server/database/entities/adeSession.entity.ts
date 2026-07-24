import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Studio 浏览器的 ADE 会话快照：
 *  - targetKey：来自 URL 的稳定标识（创作 session / 作品 id / fork / "blank"）
 *  - payloadJson：聊天记录 + 浏览器虚拟文件系统（effect.json / index.ts）
 * 仅本人可读写；与 Effect 实体解耦，避免历史记录必须先链接云端。
 */
@Entity({ name: 'ade_sessions' })
@Index('uq_ade_sessions_owner_target', ['ownerId', 'targetKey'], { unique: true })
export class AdeSession {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_ade_sessions',
  })
  id!: number

  @Column({ name: 'owner_id', type: 'integer', nullable: false })
  ownerId!: number

  @Column({ name: 'target_key', type: 'text', nullable: false })
  targetKey!: string

  @Column({ name: 'payload_json', type: 'text', default: '{}' })
  payloadJson!: string

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date
}
