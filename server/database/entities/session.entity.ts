import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'sessions' })
@Index('idx_sessions_user', ['userId'])
export class Session {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'pk_sessions' })
  id!: string // 随机 token，即主键

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'expires_at', type: 'datetime', nullable: false })
  expiresAt!: Date

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
