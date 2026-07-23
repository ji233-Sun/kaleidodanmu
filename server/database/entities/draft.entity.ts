import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 网页 ADE 浏览器虚拟文件系统的服务端持久化快照。 */
@Entity({ name: 'drafts' })
@Index('idx_drafts_owner', ['ownerId'])
@Index('idx_drafts_effect', ['effectId'])
export class Draft {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_drafts',
  })
  id!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: true })
  effectId!: number | null

  @Column({ name: 'owner_id', type: 'integer', nullable: false })
  ownerId!: number

  @Column({ name: 'snapshot_json', type: 'text', nullable: false })
  snapshotJson!: string

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date
}
